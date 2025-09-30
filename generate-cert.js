const selfsigned = require('selfsigned');
const fs = require('fs');

const attrs = [
  { name: 'commonName', value: 'mmcos.codemasters.com' },
  { name: 'countryName', value: 'DE' },
  { shortName: 'ST', value: 'Germany' },
  { name: 'localityName', value: 'Local' },
  { name: 'organizationName', value: 'MMCOS Community' },
  { shortName: 'OU', value: 'IT Department' }
];

const opts = {
  keySize: 2048,
  days: 365,
  algorithm: 'sha256',
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'mmcos.codemasters.com' },
        { type: 2, value: 'ecdn.codemasters.com' },
        { type: 2, value: 'prod.egonet.codemasters.com' },
        { type: 2, value: 'localhost' }
      ]
    }
  ]
};

console.log('Generating SSL certificate...');
const pems = selfsigned.generate(attrs, opts);

if (!fs.existsSync('./ssl')) {
  fs.mkdirSync('./ssl');
}

fs.writeFileSync('./ssl/cert.pem', pems.cert);
fs.writeFileSync('./ssl/key.pem', pems.private);

console.log('✅ SSL certificate generated successfully!');
console.log('   Files created:');
console.log('   - ./ssl/cert.pem');
console.log('   - ./ssl/key.pem');
console.log('');
console.log('Certificate includes domains:');
console.log('  • mmcos.codemasters.com');
console.log('  • ecdn.codemasters.com'); 
console.log('  • prod.egonet.codemasters.com');
console.log('  • localhost');