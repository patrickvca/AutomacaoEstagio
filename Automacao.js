// ==UserScript==
// @name         Automação de Atendimento para Sistema Web
// @namespace    http://tampermonkey.net/
// @version      2.7
// @description  Captura dados de atendimento em um sistema e preenche formulário em outro
// @match        https://sistema-atendimento.exemplo.com/*
// @match        https://portal-ocorrencias.exemplo.com/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    const urlAtual = window.location.href;

    // Configure os domínios acima (@match) e os valores abaixo de acordo com o seu ambiente.
    // Não publique domínios, códigos de FAQ ou nomes internos reais da empresa.
    const DOMINIO_SISTEMA_ATENDIMENTO = 'sistema-atendimento.exemplo.com';
    const DOMINIO_PORTAL_OCORRENCIAS = 'portal-ocorrencias.exemplo.com';
    const ASSUNTO_PADRAO = 'ASSUNTO_EXEMPLO';
    const FAQ_PADRAO = 'FAQ_EXEMPLO';

    // Trecho da mensagem do bot que marca o início do atendimento humano.
    // A hora de chegada será capturada da mensagem SEGUINTE a esta.
    const TEXTO_BOT_REFERENCIA = 'mensagem de referência do bot';

    function criarBotao(id, texto, cor, callback) {
        if (document.getElementById(id)) return;

        const botao = document.createElement('button');
        botao.id = id;
        botao.innerText = texto;

        botao.style.position = 'fixed';
        botao.style.top = '20px';
        botao.style.right = '20px';
        botao.style.zIndex = '999999999';
        botao.style.padding = '12px 16px';
        botao.style.background = cor;
        botao.style.color = '#000';
        botao.style.border = '2px solid #000';
        botao.style.borderRadius = '8px';
        botao.style.fontSize = '14px';
        botao.style.fontWeight = 'bold';
        botao.style.cursor = 'pointer';
        botao.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';

        botao.addEventListener('click', callback);
        document.body.appendChild(botao);
    }

    function preencherCampoElemento(campo, valor) {
        if (!campo) return false;

        campo.focus();
        campo.value = valor;

        campo.dispatchEvent(new Event('input', { bubbles: true }));
        campo.dispatchEvent(new Event('change', { bubbles: true }));
        campo.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

        return true;
    }

    function preencherCampo(seletor, valor) {
        const campo = document.querySelector(seletor);

        if (!campo) {
            console.warn(`Campo não encontrado: ${seletor}`);
            return false;
        }

        return preencherCampoElemento(campo, valor);
    }

    // Preenche campos de hora usando jQuery + keyup para acionar a máscara da página.
    // Tenta o id principal primeiro; se não existir, tenta o idAlt.
    function preencherCampoHora(id, idAlt, valor) {
        const idFinal = document.getElementById(id) ? id : idAlt;
        const campo = document.getElementById(idFinal);

        if (!campo) {
            console.warn(`Campo de hora não encontrado: #${id} nem #${idAlt}`);
            return false;
        }

        if (typeof jQuery !== 'undefined') {
            jQuery('#' + idFinal).val(valor).trigger('keyup').trigger('change');
        } else {
            preencherCampoElemento(campo, valor);
        }

        return true;
    }

    // Preenche um select que usa select2 via API jQuery
    function preencherSelect2(id, valor) {
        const select = document.getElementById(id);
        if (!select) {
            console.warn(`Select não encontrado: #${id}`);
            return false;
        }

        if (typeof jQuery !== 'undefined' && jQuery('#' + id).data('select2')) {
            jQuery('#' + id).val(valor).trigger('change');
        } else {
            select.value = valor;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }

        return true;
    }

    function encontrarCampoServicoRealizado() {
        let campo = document.querySelector('textarea[name="ServicoRealizado"]');
        if (campo) return campo;

        campo = document.querySelector('textarea[name*="Servico"]');
        if (campo) return campo;

        const labels = Array.from(document.querySelectorAll('label'));
        const labelServico = labels.find(label =>
            label.innerText
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .includes('servico realizado')
        );

        if (labelServico) {
            const divPai = labelServico.closest('div');
            if (divPai) {
                campo = divPai.querySelector('textarea');
                if (campo) return campo;
            }
        }

        return null;
    }

    function pegarNomeUsuario() {
        let nomeUsuario = localStorage.getItem('automacao_nome_usuario');

        if (!nomeUsuario) {
            nomeUsuario = prompt('Digite seu nome para usar no campo Serviço realizado:');

            if (!nomeUsuario || nomeUsuario.trim() === '') {
                nomeUsuario = 'Usuário';
            }

            localStorage.setItem('automacao_nome_usuario', nomeUsuario.trim());
        }

        return nomeUsuario;
    }

    // Extrai HH:MM de um span de horário do Sistema de Atendimento (formato: "DD/MM/YYYY HH:MM")
    function extrairHoraDoSpan(span) {
        if (!span) return null;
        const match = span.innerText.trim().match(/(\d{2}:\d{2})$/);
        return match ? match[1] : null;
    }

    /**
     * Retorna o span de horário (div.data span) de um bloco de mensagem (ng-repeat).
     * Cada bloco ng-repeat é o elemento pai que contém tanto o conteúdo da mensagem
     * quanto o div.data com o horário.
     */
    function pegarSpanHoraDoBlocoMensagem(blocoMensagem) {
        return blocoMensagem.querySelector('div.data span[ng-if="!mensagem.deleted"]');
    }

    /**
     * Captura os horários de chegada e saída a partir das mensagens do chat.
     *
     * - hora_chegada: horário da mensagem SEGUINTE à última ocorrência da
     *   mensagem de boas-vindas do bot (TEXTO_BOT_REFERENCIA).
     *   Se a mensagem de referência não for encontrada, usa a primeira mensagem.
     *
     * - hora_saida: horário da última mensagem de toda a conversa.
     */
    function capturarHorasMensagens() {
        // Todos os blocos de mensagem, na ordem em que aparecem no DOM.
        const blocos = Array.from(
            document.querySelectorAll(
                '[ng-repeat*="atendimentoSelecionado.mensagens"]'
            )
        ).filter(el => el.querySelector('div.data span[ng-if="!mensagem.deleted"]'));

        if (blocos.length === 0) {
            console.warn('Nenhum bloco de mensagem encontrado.');
            return null;
        }

        // Localiza o índice da ÚLTIMA ocorrência da mensagem de referência do bot.
        let indiceReferencia = -1;
        const textoRef = TEXTO_BOT_REFERENCIA.toLowerCase();

        blocos.forEach((bloco, i) => {
            const conteudo = bloco.querySelector('[ng-bind-html]');
            if (conteudo && conteudo.innerText.toLowerCase().includes(textoRef)) {
                indiceReferencia = i;
            }
        });

        // Hora de chegada: mensagem seguinte à referência ou primeira mensagem, se não encontrar.
        let blocoChegada;
        if (indiceReferencia >= 0 && indiceReferencia + 1 < blocos.length) {
            blocoChegada = blocos[indiceReferencia + 1];
        } else {
            if (indiceReferencia < 0) {
                console.warn('Mensagem de referência do bot não encontrada. Usando primeira mensagem para hora_chegada.');
            } else {
                console.warn('Mensagem de referência é a última. Usando-a para hora_chegada.');
            }
            blocoChegada = blocos[0];
        }

        // Hora de saída: última mensagem da conversa.
        const blocoSaida = blocos[blocos.length - 1];

        const horaChegada = extrairHoraDoSpan(pegarSpanHoraDoBlocoMensagem(blocoChegada));
        const horaSaida = extrairHoraDoSpan(pegarSpanHoraDoBlocoMensagem(blocoSaida));

        return { horaChegada, horaSaida };
    }

    function capturarClienteSistemaAtendimento() {
        const nomeCliente = document
            .querySelector('.contact-title .ng-binding.ng-scope')
            ?.innerText
            ?.trim();

        const telefoneCompleto = document
            .querySelector('div[ng-if="atendimentoSelecionado.informacoes.usuario.whatsapp"]')
            ?.innerText
            ?.replace(/\D/g, '')
            ?.trim();

        if (!nomeCliente) {
            alert('Não consegui capturar o nome do cliente no sistema de atendimento.');
            return;
        }

        if (!telefoneCompleto) {
            alert('Não consegui capturar o telefone do cliente no sistema de atendimento.');
            return;
        }

        const horas = capturarHorasMensagens();

        if (!horas) {
            alert('Não consegui capturar os horários das mensagens. Verifique se o atendimento está aberto e com mensagens visíveis.');
            return;
        }

        GM_setValue('cliente_nome', nomeCliente);
        GM_setValue('cliente_telefone_completo', telefoneCompleto);
        GM_setValue('hora_chegada', horas.horaChegada || '');
        GM_setValue('hora_saida', horas.horaSaida || '');

        alert(
            `Cliente capturado!\n` +
            `Nome: ${nomeCliente}\n` +
            `Hora chegada: ${horas.horaChegada}\n` +
            `Hora saída: ${horas.horaSaida}`
        );
    }

    function preencherPortalOcorrencias() {
        const nomeCliente = GM_getValue('cliente_nome', '');
        const telefoneCompleto = GM_getValue('cliente_telefone_completo', '');
        const horaChegada = GM_getValue('hora_chegada', '');
        const horaSaida = GM_getValue('hora_saida', '');

        if (!nomeCliente || !telefoneCompleto) {
            alert('Nenhum cliente capturado. Primeiro vá no sistema de atendimento e clique em "📥 Capturar Cliente".');
            return;
        }

        let ddd = '';
        let telefone = '';

        if (telefoneCompleto.startsWith('55') && telefoneCompleto.length >= 12) {
            ddd = telefoneCompleto.substring(2, 4);
            telefone = telefoneCompleto.substring(4);
        } else {
            ddd = telefoneCompleto.substring(0, 2);
            telefone = telefoneCompleto.substring(2);
        }

        const nomeUsuario = pegarNomeUsuario();
        const dataAtual = new Date().toLocaleDateString('pt-BR');
        const textoServico = `${nomeUsuario} - ${dataAtual}`;

        preencherCampo('input[name="Solicitante"]', nomeCliente);
        preencherCampo('input[name="txtDDDContato"]', ddd);
        preencherCampo('input[name="txtFoneContato"]', telefone);

        // Horários.
        if (horaChegada) preencherCampoHora('hora_chegada', 'HoraChegada', horaChegada);
        if (horaSaida) preencherCampoHora('hora_saida', 'HoraSaida', horaSaida);

        // Assunto.
        preencherSelect2('assunto', ASSUNTO_PADRAO);

        // FAQ.
        preencherSelect2('faq', FAQ_PADRAO);

        const campoServico = encontrarCampoServicoRealizado();

        if (!campoServico) {
            alert('Não encontrei o campo Serviço realizado. Verifique se ele está visível na tela antes de clicar no botão.');
            return;
        }

        preencherCampoElemento(campoServico, textoServico);
    }

    function iniciar() {
        if (urlAtual.includes(DOMINIO_SISTEMA_ATENDIMENTO)) {
            criarBotao(
                'btnCapturarClienteSistemaAtendimento',
                '📥 Capturar Cliente',
                '#4caf50',
                capturarClienteSistemaAtendimento
            );
        }

        if (urlAtual.includes(DOMINIO_PORTAL_OCORRENCIAS)) {
            criarBotao(
                'btnPreencherPortalOcorrencias',
                '🚀 Preencher Ocorrência',
                '#ff9800',
                preencherPortalOcorrencias
            );
        }
    }

    setTimeout(iniciar, 2000);

})();