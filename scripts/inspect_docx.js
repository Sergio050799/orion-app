var PizZip = require('pizzip');
var fs = require('fs');
var content = fs.readFileSync('public/templates/factura_recibo.docx');
var zip = new PizZip(content);
var xml = zip.file('word/document.xml').asText();
var paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
paras.forEach(function(p, pi) {
  var hasImage = p.includes('w:drawing');
  var pJc = (p.match(/<w:jc w:val="(\w+)"/) || [])[1] || 'left';
  var runs = p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) || [];
  if (runs.length === 0 && hasImage === false) return;
  var lineTexts = [];
  runs.forEach(function(r) {
    var text = (r.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(function(t){ return t.replace(/<[^>]+>/g, ''); }).join('');
    var isBold = r.includes('<w:b/>') || r.includes('<w:b ');
    var sz = (r.match(/<w:sz w:val="(\d+)"/) || [])[1];
    var img = r.includes('w:drawing');
    if (text || img) lineTexts.push((img?'[IMG]':'') + (isBold?'[B]':'') + (sz?'['+sz+']':'') + JSON.stringify(text));
  });
  if (lineTexts.length > 0 || hasImage) {
    console.log('P' + pi + ' [' + pJc + ']: ' + lineTexts.join(' | '));
  }
});
