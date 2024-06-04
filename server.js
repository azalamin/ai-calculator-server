import { createCanvas } from 'canvas';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Fix for __dirname in ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3002;

app.use(cors({
    origin: '*',
    methods: 'GET,PUT,POST,DELETE',
    allowedHeaders: 'Content-Type'
}));

app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

const openai = new OpenAI(process.env.SENSITIVITY_KEY);

app.get('/get_user_login', (req, res) => {
    res.json({ message: 'Login endpoint' });
});

app.get('/calculateValue', async (req, res) => {
    try {
        const { gameid1, sens1, gameid2 } = req.query;
        const baseUrl = `https://www.mouse-sensitivity.com/senstailor/`;

        let params = new URLSearchParams();
        params.append('key', process.env.SENSITIVITY_KEY);
        params.append('v', '11.3.a');
        params.append('gameid1', gameid1);
        params.append('sens1', sens1);
        params.append('sens2', '');
        params.append('multi1', '');
        params.append('multi2', '');
        params.append('gameid2', gameid2);
        params.append('query', 'calculate');

        let url = `${baseUrl}?${params}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch data from Mouse Sensitivity API');
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to calculate value. Please try again.' });
    }
});

app.get('/fetchGameNames', async (req, res) => {
    try {
        const { gameName } = req.query;
        const url = `https://www.mouse-sensitivity.com/senstailor/?key=${process.env.SENSITIVITY_KEY}&v=11.3.a&query=gamelist&game=${encodeURIComponent(gameName)}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch game names from Mouse Sensitivity API');
        }
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to verify game name. Please try again.' });
    }
});

const calculateSensitivity = (calculatedSens, aimPreference, dpi) => {
    const valorantSens = Number(calculatedSens); // Ensure calculatedSens is a number
    let feedback;

    // Ensure we are working with a fixed decimal point value
    let focusValue = valorantSens.toFixed(3);
    let decimalPart = focusValue.split('.')[1]; // Get the decimal part of the sensitivity

    if (!decimalPart) {
        decimalPart = '000'; // Default to '000' if there's no decimal part
    }

    let selectedDigit;
    switch (aimPreference) {
        case 'arm':
            selectedDigit = decimalPart[0] || '0'; // First digit after decimal
            break;
        case 'wrist':
            selectedDigit = decimalPart[1] || '0'; // Second digit after decimal
            break;
        case 'finger':
            selectedDigit = decimalPart[2] || '0'; // Third digit after decimal
            break;
        default:
            selectedDigit = decimalPart[0] || '0'; // Default to first digit
            break;
    }

    selectedDigit = parseInt(selectedDigit, 10); // Convert the selected digit to an integer

    const orientationMapping = {
        0: '48 minutes',
        1: '51 minutes',
        2: '54 minutes',
        3: '57 minutes',
        4: '60 minutes',
        5: '3 minutes',
        6: '6 minutes',
        7: '9 minutes',
        8: '12 minutes',
        9: '15 minutes'
    };

    const feedbackMapping = {
        0: {
            pros: 'Neutral/flat grip for balance. The aiming preference you selected may be your "anchor point". You can either select a new aiming preference or senstailor will tailor a new sensitivity based on your current aiming preference.',
            cons: '',
        },
        1: {
            pros: 'This sensitivity will have the fastest general aim and fastest reaction times as well as fastest precision.',
            cons: 'This sensitivity will be bad for tracking and you may undershoot at times. It also will be biased to left-hand side targets/shots and weaker at hitting right-hand side targets/shots.',
        },
        2: {
            pros: 'This sensitivity will have a balance between control, highest precision and even target selection on left and right.',
            cons: 'This sensitivity has a low "range"/"field of aim" so it will undershoot and struggle with tracking.',
        },
        3: {
            pros: 'This sensitivity will have the best mouse control. You will feel a strong grip and be able to make high accuracy adjustments and 180s.',
            cons: 'This sensitivity will be bad for tracking and will undershoot. It also will be biased to left-hand side targets/shots and weaker at hitting right-hand side targets/shots.',
        },
        4: {
            pros: 'This sensitivity is great for flick aim and spray transfers.',
            cons: 'This sensitivity will look shaky and can be very inconsistent.',
        },
        5: {
            pros: 'This sensitivity has the best all-round aim. It\'s the most consistent for tracking, flicking, and precision aim. It also has even target selection on left and right.',
            cons: 'This sensitivity has a very high skill ceiling to master and get desired effects. It can look very shaky.',
        },
        6: {
            pros: 'This sensitivity will have the highest first shot accuracy and tracking.',
            cons: 'This sensitivity will feel extremely shaky and inconsistent.',
        },
        7: {
            pros: 'The sensitivity has great focus/looks stable and is great for movement and rhythm-based aiming. It also has a range/"field of aim".',
            cons: 'This sensitivity may cause you to overshoot.',
        },
        8: {
            pros: 'The sensitivity will have "pencil aim". It\'s amazing for prefiring, adjustments, tracking, flicking and has very high mouse control. It also has even target selection on left and right.',
            cons: 'This sensitivity will cause you to overshoot. It can feel very shaky and inconsistent and the movement can be sloppy at times.',
        },
        9: {
            pros: 'This sensitivity has the largest field of aim. It\'s very fast for adjustments and reaction time. It can also be great for movement and prefiring.',
            cons: 'This sensitivity will be bad for micro-adjustments/precision. At times it will feel inconsistent and shaky and overshoot a lot.',
        }
    };

    feedback = {
        pros: feedbackMapping[selectedDigit].pros,
        cons: feedbackMapping[selectedDigit].cons,
        orientation: orientationMapping[selectedDigit],
        clockImageUrl: `/public/clock_images/${selectedDigit}.png`,
        newSensitivity: valorantSens,
        dpi: dpi,
        aimPreference: aimPreference,
    };

    return {
        valorantSens: valorantSens.toFixed(3),
        feedback,
    };
};

app.post('/convertSensitivity', (req, res) => {
    const { calculatedSens, aimPreference, dpi } = req.body;
    try {
        const result = calculateSensitivity(calculatedSens, aimPreference, dpi);
        const { valorantSens, feedback } = result;

        res.json({
            valorantSens: valorantSens,
            feedback: feedback,
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to calculate sensitivity. Please try again.' });
    }
});

// Function to generate zigzag image based on orientation
const generateZigzagImage = (width, height, amplitude, orientation) => {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = 'black';
    context.lineWidth = 2;

    context.beginPath();
    let x = 0;
    let y = height / 2;
    context.moveTo(x, y);

    const angle = (orientation * Math.PI) / 30; // Convert minutes to radians
    const step = width / 10; // Define step size for the zigzag pattern

    for (let i = 0; i < 10; i++) {
        x += step;
        y += amplitude * Math.sin(i * angle);
        context.lineTo(x, y);
    }
    context.stroke();

    return canvas.toBuffer();
};

app.get('/generateZigzag', (req, res) => {
    try {
        const { width, height, sensitivity } = req.query;

        const amplitude = parseFloat(sensitivity) * 10; // Example transformation

        const selectedDigit = parseInt(sensitivity.split('.')[1][0], 10); // Assuming we use the first digit after decimal
        const orientationMapping = {
            0: 48,
            1: 51,
            2: 54,
            3: 57,
            4: 60,
            5: 3,
            6: 6,
            7: 9,
            8: 12,
            9: 15
        };
        const orientation = orientationMapping[selectedDigit];

        if (isNaN(amplitude) || isNaN(width) || isNaN(height) || isNaN(orientation)) {
            throw new Error('Invalid input parameters');
        }

        const zigzagImage = generateZigzagImage(parseInt(width), parseInt(height), amplitude, orientation);
        console.log('Generated zigzag image successfully');

        res.setHeader('Content-Type', 'image/png');
        res.send(zigzagImage);
    } catch (error) {
        console.error('Error generating zigzag image:', error);
        res.status(500).json({ error: 'Failed to generate zigzag image. Please try again.' });
    }
});

// OpenAI GPT-TURBO-3.5 
app.post('/generateMessage', async (req, res) => {
    const { prompt } = req.body;
    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: prompt }],
            model: "gpt-3.5-turbo",
        });

        const message = completion?.choices[0]?.message;
        res.json({ message });
    } catch (error) {
        console.error('Error generating message:', error);
        res.status(500).json({ error: 'Failed to generate message' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
