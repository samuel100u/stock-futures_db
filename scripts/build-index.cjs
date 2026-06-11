const fs = require('fs')
const html = fs.readFileSync('index.html.bak', 'utf8')
let bodyMatch = html.match(/<body[\s\S]*<\/body>/)[0]
bodyMatch = bodyMatch.replace(/<script[\s\S]*?<\/script>\s*(?=<\/body>)/, '')
const newHead = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>股市數據分析儀表板 - 智慧自動版</title>
    <script vite-ignore src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="/src/styles/main.css" />
</head>
`
const bodyWithScript = bodyMatch.replace('</body>', '    <script type="module" src="/src/main.js"></script>\n</body>')
const newHtml = newHead + bodyWithScript + '\n</html>\n'
fs.writeFileSync('index.html', newHtml)
console.log('index.html written')
