try {
    const Jimp = require('jimp');
    console.log('Jimp loaded successfully');
    console.log('Jimp keys:', Object.keys(Jimp));
} catch (e) {
    console.error('Failed to load Jimp:', e);
}
