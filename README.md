# SkinLog

Diário pessoal para acompanhar mudanças na pele por meio de registros datados, fotos e anotações. O projeto oferece histórico visual e comparação de imagens; **não diagnostica e não substitui uma avaliação médica**.

## Funcionalidades

- Registros por região do corpo, com data, foto opcional, sintomas de 0 a 10, produtos e observações.
- Armazenamento local no navegador usando IndexedDB.
- Histórico filtrável e gráfico dos sintomas por região.
- Comparação visual de duas fotos e medidas simples de brilho, tom avermelhado e diferença entre imagens.
- Exportação e importação de backup JSON, além da exclusão de registros.
- A API de comparação é opcional; o diário funciona sem ela.

## Requisitos

- Python 3.9 ou superior.
- Um navegador moderno com suporte a IndexedDB, `createImageBitmap` e Canvas.
- Node.js é opcional e serve somente para verificar a sintaxe do JavaScript.

## Executar localmente

No PowerShell, na pasta raiz do projeto:

1. Crie e ative um ambiente virtual:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. Instale as dependências da API:

   ```powershell
   python -m pip install -r backend\requirements.txt
   ```

3. Inicie a API em um terminal:

   ```powershell
   python backend\app.py
   ```

4. Em outro terminal, na raiz do projeto, sirva os arquivos da interface:

   ```powershell
   python -m http.server 8000
   ```

5. Acesse <http://localhost:8000>. A API fica disponível em <http://localhost:5000/api/health>.

Para usar apenas o diário, sem comparação de imagens, abra `index.html` em um navegador. Servir a interface localmente, como no passo 4, é recomendado para evitar restrições do navegador ao acessar a API.

## Uso e privacidade

Os registros e as fotos ficam no IndexedDB do navegador e não são sincronizados. Use **Exportar backup** antes de limpar os dados do navegador ou trocar de dispositivo. O arquivo exportado contém informações pessoais e fotos em JSON; mantenha-o em local seguro.

Somente ao acionar **Medir diferenças** as duas fotos selecionadas são enviadas à API local. A API calcula medidas temporárias e não as armazena. A comparação é influenciada por luz, distância, ângulo e câmera; seus resultados não indicam melhora ou piora clínica.

Esta aplicação foi preparada para uso local. A API não tem autenticação e o CORS está aberto para facilitar a interface local. **Antes de publicar ou expor a API, configure origens CORS específicas, autenticação, HTTPS e controles de acesso apropriados.**

## Arquivos

- `index.html`: estrutura e conteúdo da interface.
- `assets/css/style.css`: estilos, layout responsivo e animações.
- `assets/js/script.js`: navegação, armazenamento, gráficos, fotos, comparação e backups.
- `backend/app.py`: endpoints Flask e limites de requisição.
- `backend/analysis.py`: validação de imagens e cálculo das medidas visuais.
- `backend/requirements.txt`: dependências Python da API.
- `passo-a-passo.txt`: guia detalhado de instalação e utilização.
- `versão.txt`: descrição do projeto, inventário de arquivos, versão e melhorias futuras.

## Versão e validação

Versão documentada: **1.0.0**. A versão do formato dos backups (`version: 1`) é independente da versão do projeto.

Verificações rápidas:

```powershell
node --check assets\js\script.js
python -c "import ast, pathlib; [ast.parse(pathlib.Path(p).read_text(encoding='utf-8'), filename=p) for p in [r'backend\app.py', r'backend\analysis.py']]"
```

Consulte [passo-a-passo.txt](passo-a-passo.txt) para instruções completas e [versão.txt](versão.txt) para o inventário e o roteiro de evolução.

## 👨‍💻 Autor

### Diego Francisco da Silva

Desenvolvedor Front-End em formação e estudante de Engenharia de Software.

- **[Site Empresa](https://diegofranciscodasilva.github.io/dev-software-web/)**: dev.software.web
- **[LinkedIn](https://www.linkedin.com/in/diego-francisco-da-silva/)**: diego-francisco-da-silva
- **[GitHub](https://github.com/diegofranciscodasilva)**: diegofranciscodasilva
- **[Instagram](https://www.instagram.com/diego_francisco_da_silva/)**: @diego_francisco_da_silva
- **[Instagram](https://www.instagram.com/dev.software.web/)**: @dev.software.web

---

Feito com ❤️ por Diego.
