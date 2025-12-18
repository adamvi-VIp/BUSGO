const JimpModule = require('jimp');
const path = require('path');

// Handle different import styles (CommonJS vs ESM interop)
const Jimp = JimpModule.Jimp || JimpModule;

async function generateIcons() {
    const assetsDir = path.join(__dirname, '../busgo/src/assets');
    const inputFile = path.join(assetsDir, 'busstationbox.png');

    console.log(`Loading base icon from: ${inputFile}`);

    // Ensure Jimp.read is available
    if (typeof Jimp.read !== 'function') {
        console.error('Jimp.read is not a function. Keys:', Object.keys(Jimp));
        return;
    }

    try {
        const image = await Jimp.read(inputFile);
        // Enforce 48x48
        image.resize({ w: 48, h: 48 }); // Syntax might be resize(w, h) or object? 
        // Jimp docs: resize(w, h, mode, cb)
        // I'll use standard: resize(48, 48)
        image.resize({ w: 48, h: 48 });

        const colors = {
            'tram': '#B91D47',
            'train': '#35b1a51f',
            'ferry': '#0288D1',
            'trolleybus': '#7B1FA2',
            'night': '#808080' // Gray for night/unavailable
        };

        for (const [type, hex] of Object.entries(colors)) {
            const icon = image.clone();

            // Parse hex
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);

            icon.scan(0, 0, icon.bitmap.width, icon.bitmap.height, function (x, y, idx) {
                const pr = this.bitmap.data[idx];
                const pg = this.bitmap.data[idx + 1];
                const pb = this.bitmap.data[idx + 2];
                const pa = this.bitmap.data[idx + 3];

                if (pa < 10) return;

                // Logic: Distinct "Blue" vs "White/Gray"
                // Blue Bg: R~14, G~165, B~233
                const isBlueish = pb > pr + 40 && pb > pg - 50;
                const isWhiteOrGray = pr > 180 && pg > 180 && pb > 180;

                if (isBlueish && !isWhiteOrGray) {
                    this.bitmap.data[idx] = r;
                    this.bitmap.data[idx + 1] = g;
                    this.bitmap.data[idx + 2] = b;
                    // Keep alpha
                } else {
                    // It's part of the icon (white/gray)
                    // Do nothing
                }
            });

            const outFile = path.join(assetsDir, `${type}-icon.png`);
            await icon.write(outFile); // .write is alias for writeAsync or takes callback?
            // Modern Jimp uses .write(path) which returns promise? No, .writeAsync(path)
            // I'll use write(path) with a callback if needed or assume writeAsync exists
            if (icon.writeAsync) {
                await icon.writeAsync(outFile);
            } else {
                icon.write(outFile);
            }
            console.log(`Generated ${outFile}`);
        }
    } catch (err) {
        console.error('Error processing icons:', err);
    }
}

generateIcons();
