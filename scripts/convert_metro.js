const fs = require('fs');
const path = require('path');
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.error('Error: "sharp" library is not installed. Please install it to convert SVGs to PNGs.');
    console.error('Run: npm install sharp');
    process.exit(1);
}

const assetsDir = path.join(__dirname, '../busgo/src/assets');
const metroFiles = ['metroA_v2', 'metroB_v2', 'metroC_v2'];

async function convertMetroIcons() {
    console.log('Converting Metro SVGs to PNGs...');

    for (const name of metroFiles) {
        const svgPath = path.join(assetsDir, `${name}.svg`);
        // We want uniform naming: metroA-icon.png
        // name format: metroA_v2 -> metroA
        const typeName = name.replace('_v2', ''); // metroA
        const pngPath = path.join(assetsDir, `${typeName}-icon.png`);
        const dimmedPath = path.join(assetsDir, `${typeName}-icon-dimmed.png`);

        if (!fs.existsSync(svgPath)) {
            console.warn(`Source file not found: ${svgPath}`);
            continue;
        }

        try {
            // Convert to PNG (48x48)
            await sharp(svgPath)
                .resize(48, 48)
                .png()
                .toFile(pngPath);
            console.log(`Generated ${pngPath}`);

            // Generate Dimmed Version
            // Use modulate to darken the image (brightness 0.55 = 55% of original brightness)
            await sharp(pngPath)
                .modulate({ brightness: 0.55 })
                .toFile(dimmedPath);

            console.log(`Generated ${dimmedPath}`);

        } catch (err) {
            console.error(`Failed to convert ${name}:`, err);
        }
    }
}

convertMetroIcons();
