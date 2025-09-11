const fs = require('fs');
const path = require('path');
const undiciWebidl = path.join(__dirname, 'node_modules', 'undici', 'lib', 'web', 'webidl', 'index.js');
if (fs.existsSync(undiciWebidl)) {
  let content = fs.readFileSync(undiciWebidl, 'utf8');
  content = content.replace('webidl.is.File = webidl.util.MakeTypeAssertion(File)', 'webidl.is.File = webidl.util.MakeTypeAssertion(global.File || class {})');
  fs.writeFileSync(undiciWebidl, content, 'utf8');
}