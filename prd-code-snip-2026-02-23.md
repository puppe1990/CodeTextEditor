Perfeito 👍 então vamos **ajustar e profissionalizar seu PRD** deixando ele mais técnico, objetivo e pronto para implementação.

# 📘 PRD — CodeSnip Editor (Extensão Chrome)

## 1\. Visão Geral

O **CodeSnip Editor** será uma extensão Chrome que abre um mini editor de código em uma nova aba, inspirado no VSCode, utilizando **CodeMirror 6** como engine principal.

O editor permitirá:

1.  Abrir pastas reais do sistema (File System Access API)
2.  Navegar por árvore de arquivos
3.  Editar e salvar arquivos diretamente no disco
4.  Atalhos inspirados no VSCode
5.  Persistência de configurações locais

## 2\. Objetivo do Produto

Criar um editor leve e rápido dentro do Chrome para edição rápida de projetos locais, sem depender de IDEs externas.

## 3\. Escopo

### ✅ Incluído

1.  Editor com syntax highlighting
2.  Abertura de pasta real do sistema
3.  Árvore de arquivos (sidebar)
4.  Criar / renomear / deletar arquivos e pastas
5.  Salvamento real no sistema (Ctrl+S)
6.  Atalhos estilo VSCode
7.  Tema dark/light
8.  Persistência de configurações via `chrome.storage.local`

### ❌ Fora do escopo (v1)

1.  Git integration
2.  Extensões/plugins
3.  Terminal integrado
4.  Debugger
5.  LSP (Language Server Protocol)
6.  Sincronização em nuvem (Chrome Sync)

## 4\. Arquitetura do Projeto

/code-snip-editor/

├── manifest.json

├── icons/

├── popup/

│ ├── popup.html

│ ├── popup.js

│ └── popup.css

├── editor/

│ ├── index.html

│ ├── editor.js

│ ├── editor.css

│ ├── fileSystem.js

│ ├── fileTree.js

│ └── shortcuts.js

## 5\. Stack Tecnológica

ComponenteTecnologiaJustificativa

Editor

CodeMirror 6

Leve, modular, suporta ES Modules

Sistema de arquivos

File System Access API

Acesso real a pastas e arquivos

Persistência

chrome.storage.local

Configurações e estado

UI

HTML + CSS + Vanilla JS

Simples e leve

Manifest

Manifest V3

Padrão atual do Chrome

## 6\. Fluxo do Usuário

1.  Usuário instala extensão
2.  Clica no ícone
3.  Popup abre
4.  Clica em "Abrir Editor"
5.  Nova aba abre `editor/index.html`
6.  Usuário pressiona `Ctrl+O`
7.  Seleciona pasta do sistema
8.  Sidebar carrega árvore de arquivos
9.  Usuário edita arquivo
10.  `Ctrl+S` salva diretamente no disco

## 7\. Funcionalidades Detalhadas

### 7.1 Editor (CodeMirror 6)

Suporte a:

1.  JavaScript
2.  TypeScript
3.  HTML
4.  CSS
5.  Python
6.  JSON
7.  Markdown
8.  SQL

Recursos:

1.  Line numbers
2.  Auto indent
3.  Bracket matching
4.  Comment toggle (Ctrl+/)
5.  Tema dark (default)
6.  Fonte configurável
7.  Tab size configurável

### 7.2 Sistema de Arquivos

Implementado com:

window.showDirectoryPicker()

Funcionalidades:

1.  Abrir pasta
2.  Ler estrutura recursiva
3.  Criar arquivo
4.  Criar pasta
5.  Renomear
6.  Deletar
7.  Salvar conteúdo editado

⚠️ Observação:

O usuário precisa conceder permissão ao selecionar a pasta. O handle pode expirar após refresh.

### 7.3 Estrutura de Estado

### chrome.storage.local

{

"settings": {

"theme": "dark",

"fontSize": 14,

"tabSize": 2

},

"recentFiles": \[\],

"lastOpenedFolder": null

}

Arquivos não são armazenados no storage — são salvos diretamente no disco.

## 8\. Atalhos Estilo VSCode

AtalhoAção

Ctrl+S

Salvar

Ctrl+N

Novo arquivo

Ctrl+O

Abrir pasta

Ctrl+P

Quick open

Ctrl+B

Toggle sidebar

Ctrl+/

Comentar linha

Ctrl+D

Duplicar linha

Alt+↑/↓

Mover linha

Ctrl+Shift+K

Deletar linha

Ctrl+Shift+P

Command palette (v1 simples)

## 9\. Manifest V3

{

"manifest\_version": 3,

"name": "CodeSnip Editor",

"version": "1.0.0",

"description": "Mini editor estilo VSCode dentro do Chrome",

"permissions": \["storage"\],

"action": {

"default\_popup": "popup/popup.html",

"default\_title": "Abrir CodeSnip"

},

"icons": {

"16": "icons/icon16.png",

"48": "icons/icon48.png",

"128": "icons/icon128.png"

}

}

Não é necessário permission extra para File System Access API.

## 10\. UI Layout

\----------------------------------------

| Topbar (File | Edit | Theme | etc) |

\----------------------------------------

| Sidebar | Editor (CodeMirror) |

| | |

| Tree | |

| | |

\----------------------------------------

| Status Bar (Ln, Col, Language) |

\----------------------------------------

## 11\. Persistência (Explicação sobre Sync)

Você disse que não sabe como funciona Chrome Sync.

Resumo:

1.  `chrome.storage.local` → salva só no seu computador.
2.  `chrome.storage.sync` → sincroniza entre dispositivos com mesma conta Google (limitado a 100KB).

👉 Para um editor de arquivos locais, **local é suficiente e mais seguro**.

Não vamos usar sync na v1.

## 12\. Riscos Técnicos

RiscoMitigação

Handle da pasta expira

Solicitar reabertura

Performance em pastas grandes

Lazy loading da árvore

Compatibilidade

Funciona apenas em Chrome/Edge

## 13\. Roadmap Futuro (v2+)

1.  Git integration
2.  Tabs múltiplas
3.  Split editor
4.  Busca global
5.  Extensões
6.  Mini terminal
7.  LSP

# ✅ Status

PRD ajustado, estruturado e pronto para implementação.

Se você quiser, o próximo passo pode ser:

1.  🚀 Gerar toda a estrutura base com os arquivos iniciais
2.  🧠 Implementar primeiro o editor básico
3.  📁 Implementar File System + árvore
4.  ⌨️ Implementar atalhos
5.  🎨 Refinar UI

Qual você prefere que eu faça agora?