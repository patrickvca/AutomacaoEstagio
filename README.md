# Automação de Atendimento para Sistema Web

Script Tampermonkey que captura dados básicos de um atendimento em um sistema web e preenche automaticamente um formulário de ocorrência em outro portal.

## Sobre o projeto

Este projeto foi criado como uma automação para reduzir tarefas repetitivas durante atendimentos.

A automação captura informações como:

- Nome do cliente;
- Telefone;
- Horário de chegada;
- Horário de saída.

Depois disso, ela preenche automaticamente alguns campos em um formulário de ocorrência.

## Tecnologias utilizadas

- JavaScript;
- Tampermonkey;
- Manipulação de DOM;
- LocalStorage;
- jQuery, quando disponível na página;
- Select2, quando disponível no formulário.

## Como configurar

No arquivo `Automacao.js`, substitua os valores de exemplo:

```js
// @match        https://sistema-atendimento.exemplo.com/*
// @match        https://portal-ocorrencias.exemplo.com/*

const DOMINIO_SISTEMA_ATENDIMENTO = 'sistema-atendimento.exemplo.com';
const DOMINIO_PORTAL_OCORRENCIAS = 'portal-ocorrencias.exemplo.com';
const ASSUNTO_PADRAO = 'ASSUNTO_EXEMPLO';
const FAQ_PADRAO = 'FAQ_EXEMPLO';
const TEXTO_BOT_REFERENCIA = 'mensagem de referência do bot';
