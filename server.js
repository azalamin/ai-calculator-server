import cors from 'cors';
import express from 'express';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix for __dirname in ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3002;


OpenAI.apiKey = '';

// Enable CORS
app.use(cors({
    origin: '*',
    methods: 'GET,PUT,POST,DELETE',
    allowedHeaders: 'Content-Type'
}));

app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// Environment variable for API key
const API_KEY = process.env.API_KEY;


app.get('/get_user_login', (req, res) => {

    res.json({ message: 'Login endpoint' });
});

app.get('/calculateValue', async (req, res) => {
    try {
        const { gameid1, sens1, gameid2 } = req.query;
        const baseUrl = `https://www.mouse-sensitivity.com/senstailor/`;

        let params = new URLSearchParams();
        params.append('key', API_KEY);
        params.append('v', '11.3.a');
        params.append('gameid1', gameid1);
        params.append('sens1', sens1);
        params.append('sens2', '');
        params.append('multi1', '');
        params.append('multi2', '');
        params.append('gameid2', gameid2);
        params.append('query', 'calculate');

        let url = `${baseUrl}?${params}`;
        console.log(url);

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
        const url = `https://www.mouse-sensitivity.com/senstailor/?key=${API_KEY}&v=11.3.a&query=gamelist&game=${encodeURIComponent(gameName)}`;

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

const calculateSensitivity = (overWatchSens, aimPreference, dpi) => {
    const valorantSens = overWatchSens * 0.07;
    let feedback = '';
    let orientation = '';
    let clockImageUrl = '';

    let focusValue;
    switch (aimPreference) {
        case 'wrist':
            focusValue = parseInt(valorantSens.toString().split('.')[1]?.[0]);
            break;
        case 'finger':
            focusValue = parseInt(valorantSens.toString().split('.')[1]?.[1]);
            break;
        case 'arm':
            focusValue = parseInt(valorantSens.toString().split('.')[1]?.[2]);
            break;
        default:
            focusValue = parseInt(valorantSens.toString().split('.')[0]);
            break;
    }

    switch (focusValue) {
        case 1:
            feedback = 'Fastest general aim and reaction times, bad for tracking.';
            orientation = '48 minutes';
            clockImageUrl = '/public/clock_images/1.png';
            break;
        case 2:
            feedback = 'Balance between control, precision, and target selection.';
            orientation = '51 minutes';
            clockImageUrl = '/public/clock_images/2.png';
            break;
        case 3:
            feedback = 'Best mouse control, high accuracy adjustments, bad for tracking.';
            orientation = '54 minutes';
            clockImageUrl = '/public/clock_images/3.png';
            break;
        case 4:
            feedback = 'Great for flick aim and spray transfers, can be inconsistent.';
            orientation = '57 minutes';
            clockImageUrl = '/public/clock_images/4.png';
            break;
        case 5:
            feedback = 'Most consistent for tracking, flicking, and precision aim.';
            orientation = '60 minutes';
            clockImageUrl = '/public/clock_images/5.png';
            break;
        case 6:
            feedback = 'Highest first shot accuracy and tracking, extremely shaky.';
            orientation = '3 minutes';
            clockImageUrl = '/public/clock_images/6.png';
            break;
        case 7:
            feedback = 'Great focus, stable for movement and rhythm based aiming.';
            orientation = '6 minutes';
            clockImageUrl = '/public/clock_images/7.png';
            break;
        case 8:
            feedback = 'Pencil aim, high mouse control, may overshoot and feel shaky.';
            orientation = '9 minutes';
            clockImageUrl = '/public/clock_images/8.png';
            break;
        case 9:
            feedback = 'Largest field of aim, fast adjustments, bad for micro adjustments.';
            orientation = '12 minutes';
            clockImageUrl = '/public/clock_images/9.png';
            break;
        default:
            feedback = 'Default sensitivity feedback.';
            break;
    }

    return {
        valorantSens: valorantSens.toFixed(3),
        feedback,
        orientation,
        clockImageUrl
    };
};

app.post('/convertSensitivity', (req, res) => {
    const { overWatchSens, aimPreference, dpi } = req.body;
    try {
        const result = calculateSensitivity(overWatchSens, aimPreference, dpi);
        res.json(result);
        console.log(result)
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to calculate sensitivity. Please try again.' });
    }
});

// OpenAI GPT-TURBO-3.5 
app.post('/generateMessage', async (req, res) => {
    const { prompt } = req.body;
    console.log(prompt)
    try {
        const completion = await OpenAI.complete({
            engine: 'text-davinci-003', // Choose the appropriate engine
            prompt: prompt,
            maxTokens: 1024, // Adjust as needed
            temperature: 0.7, // Adjust as needed
            n: 1,
            stop: null, // Or provide a stop sequence
        });

        // const completion = await OpenAI.completions.create({
        //     model: 'gpt-3.5-turbo-instruct',
        //     prompt: prompt
        // });

        const message = completion.data.choices[0].text.trim();
        res.json({ message });

    } catch (error) {
        console.error('Error generating message:', error);
        res.status(500).json({ error: 'Failed to generate message' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
