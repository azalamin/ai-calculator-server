import axios from 'axios';
import { createCanvas } from "canvas";
import cors from "cors";
import express from "express";
import admin from 'firebase-admin';
import { MongoClient } from "mongodb";
import fetch from "node-fetch";
import OpenAI from "openai";
import path from "path";
import Stripe from "stripe";
import Twitter from 'twitter-v2';
import { fileURLToPath } from 'url';
import config from "./config/index.js";

// Fix for __dirname in ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3002;

const BASE_URL = `https://www.mouse-sensitivity.com/senstailor/`;
const API_VERSION = "11.3.a";

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@aicalculator.q2uc7au.mongodb.net/`;
const client = new MongoClient(uri);

app.use(
    cors({
        origin: "*",
        methods: "GET,PUT,POST,DELETE",
        allowedHeaders: "Content-Type, Authorization",
    })
);


app.use(express.json());
app.use("/public", express.static(path.join(__dirname, "public")));

const openai = new OpenAI(config.sensitivity_key);
const stripe = new Stripe(config.stripeSecretKey);

// YouTube Channel ID
const CHANNEL_ID = config.channelId;

app.get("/get_user_login", (req, res) => {
    res.json({ message: "Login endpoint" });
});


// Verify Firebase token middleware
const verifyToken = async (req, res, next) => {
    const idToken = req.headers.authorization;
    if (!idToken) {
        return res.status(401).send('Unauthorized');
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        return res.status(401).send('Unauthorized');
    }
};


const API_KEYS = [
    config.youtubeApiKey,
    config.youtubeApiKey2,
    config.youtubeApiKey3,
    config.youtubeApiKey4,
];

let currentKeyIndex = 0;

const getApiKey = () => {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    return API_KEYS[currentKeyIndex];
};



// Initialize the Twitter client with your API keys
const twitterClient = new Twitter({
    consumer_key: config.twitterConsumerKey,
    consumer_secret: config.twitterConsumerSecret,
    bearer_token: config.twitterBearerToken
});


async function main() {
    try {
        await client.connect();
        console.log("MongoDB connected");
        const database = client.db("ai-calculator");
        const usersCollection = database.collection("users");
        const commentsCollection = database.collection("comments");

        app.get('/tweets', async (req, res) => {
            try {
                const { data } = await client.get('tweets', {
                    ids: '1512178023726206979', // Replace with valid Twitter user ID
                    'tweet.fields': 'created_at,text,author_id'
                });
                res.json(data);
            } catch (error) {
                console.error('Error fetching tweets:', error);
                res.status(500).json({ error: 'Error fetching tweets', details: error.message });
            }
        });

        app.get('/videos', async (req, res) => {
            try {
                const response = await axios.get(`https://www.googleapis.com/youtube/v3/search`, {
                    params: {
                        key: getApiKey(),
                        channelId: CHANNEL_ID,
                        part: 'snippet',
                        order: 'date',
                        maxResults: 5,
                    }
                });
                res.json(response.data.items);
                console.log(response)
            } catch (error) {
                console.error('Failed to fetch videos:', error.response ? error.response.data : error.message);
                if (error.response && error.response.status === 403) {
                    res.status(403).json({ message: 'Quota limit reached. Please try again later.' });
                } else {
                    res.status(500).send('Server error while fetching videos');
                }
            }
        });


        // API endpoint to store user data on sign up
        app.post("/save_user_data", async (req, res) => {
            const { email, firstName, lastName } = req.body;
            try {
                const user = await usersCollection.findOne({ email });
                if (user) {
                    return res.status(200).json({ message: "User already exists" });
                }
                const result = await usersCollection.insertOne({
                    email,
                    firstName,
                    lastName,
                    answeredQuestions: false,
                });
                res.status(200).json({ message: "User data saved successfully", result });
            } catch (error) {
                res.status(500).json({ message: "Error saving user data", error });
            }
        });

        // API endpoint to store user data (including 10 question answers)
        app.post("/save_answers", async (req, res) => {
            const { email, answers } = req.body;
            try {
                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { answers, answeredQuestions: true } },
                    { upsert: true }
                );
                res.status(200).json({ message: "User answers saved successfully", result });
            } catch (error) {
                res.status(500).json({ message: "Error saving user answers", error });
            }
        });

        // API endpoint to store user login time
        app.post("/user_login", async (req, res) => {
            const { email, loginTime } = req.body;
            try {
                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { loginTime, loggedIn: true } },
                    { upsert: true }
                );
                res.status(200).json({ message: "User login time saved successfully", result });
            } catch (error) {
                res.status(500).json({ message: "Error saving user login time", error });
            }
        });

        app.post("/check_user", async (req, res) => {
            const { email } = req.body;
            try {
                const user = await usersCollection.findOne({ email });
                if (user && user.answeredQuestions) {
                    return res.status(200).json({ message: "User has answered the questions" });
                }
                res.status(200).json({ message: "User has not answered the questions" });
            } catch (error) {
                console.error("Error checking user answers:", error);
                res.status(500).json({ error: "Failed to check user answers" });
            }
        });

        // API endpoint to store user logout time
        app.post("/user_logout", async (req, res) => {
            const { email, logoutTime } = req.body;
            try {
                const result = await usersCollection.updateOne(
                    { email },
                    { $set: { logoutTime, loggedIn: false } }
                );
                res.status(200).json({ message: "User logout time saved successfully", result });
            } catch (error) {
                res.status(500).json({ message: "Error saving user logout time", error });
            }
        });

        app.post("/get_user_answers", async (req, res) => {
            const { email } = req.body;

            try {
                const user = await usersCollection.findOne({ email });
                if (user && user.answers) {
                    return res.status(200).json({ answers: user.answers });
                }

                res.status(404).json({ message: "No answers found for the user" });
            } catch (error) {
                console.error("Error fetching user answers:", error);
                res.status(500).json({ error: "Failed to fetch user answers" });
            }
        });

        const gptDictionary = {
            1: {
                suggestion:
                    "This sensitivity will have the fastest general aim and fastest reaction times as well as fastest precision.",
                pros: "Fastest general aim and fastest reaction times, highest precision.",
                cons: "Bad for tracking, may undershoot, biased to left-hand side targets.",
            },
            2: {
                suggestion:
                    "This sensitivity will have a balance between control, highest precision and even target selection on left and right.",
                pros: "Balanced control, highest precision, even target selection on left and right.",
                cons: "Low range/field of aim, may undershoot and struggle with tracking.",
            },
            3: {
                suggestion:
                    "This sensitivity will have the best mouse control. You will feel a strong grip and be able to make high accuracy adjustments and 180s.",
                pros: "Best mouse control, strong grip, high accuracy adjustments and 180s.",
                cons: "Bad for tracking, may undershoot, biased to left-hand side targets.",
            },
            4: {
                suggestion: "This sensitivity is great for flick aim and spray transfers.",
                pros: "Great for flick aim and spray transfers.",
                cons: "May look shaky and be very inconsistent.",
            },
            5: {
                suggestion:
                    "This sensitivity has the best all-round aim. It's the most consistent for tracking, flicking and precision aim. It also has even target selection on left and right.",
                pros: "Best all-round aim, consistent for tracking, flicking, and precision aim, even target selection on left and right.",
                cons: "High skill ceiling to master, may look very shaky.",
            },
            6: {
                suggestion: "This sensitivity will have the highest first shot accuracy and tracking.",
                pros: "Highest first shot accuracy and tracking.",
                cons: "May feel extremely shaky and inconsistent.",
            },
            7: {
                suggestion:
                    "The sensitivity has great focus/looks stable and is great for movement and rhythm-based aiming. It also has a range/field of aim.",
                pros: "Great focus, stable, good for movement and rhythm-based aiming, has a range/field of aim.",
                cons: "May cause overshooting.",
            },
            8: {
                suggestion:
                    "The sensitivity will have 'pencil aim'. It's amazing for prefiring, adjustments, tracking, flicking and has very high mouse control. It also has even target selection on left and right.",
                pros: "Amazing for prefiring, adjustments, tracking, flicking, very high mouse control, even target selection on left and right.",
                cons: "May cause overshooting, can feel very shaky and inconsistent, movement can be sloppy.",
            },
            9: {
                suggestion:
                    "This sensitivity will have the largest field of aim. It's very fast for adjustments and reaction time. It can also be great for movement and prefiring.",
                pros: "Largest field of aim, very fast for adjustments and reaction time, great for movement and prefiring.",
                cons: "Bad for micro adjustments/precision, may feel inconsistent and shaky, may overshoot a lot.",
            },
        };

        const findBestMatchingSuggestion = query => {
            const keywords = query.toLowerCase().split(" ");
            let bestMatch = "";
            let bestScore = 0;

            for (const [key, value] of Object.entries(gptDictionary)) {
                const score = keywords.reduce(
                    (acc, keyword) => acc + (value.suggestion.toLowerCase().includes(keyword) ? 1 : 0),
                    0
                );
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = key;
                }
            }
            return bestMatch;
        };

        app.post("/gptSuggestion", async (req, res) => {
            const { query, aimPreference, currentSensitivity } = req.body;
            const suggestionKey = findBestMatchingSuggestion(query);
            const { suggestion, pros, cons } = gptDictionary[suggestionKey] || {};

            if (suggestionKey) {
                const newSensitivity = substituteSensitivityValue(
                    currentSensitivity,
                    aimPreference,
                    suggestionKey
                );
                res.json({ suggestion, pros, cons, newSensitivity });
            } else {
                res.json({ suggestion: "I'm sorry, I don't have a suggestion for that." });
            }
        });

        const substituteSensitivityValue = (sensitivity, aimPreference, newDigit) => {
            let [integerPart, decimalPart] = sensitivity.toString().split(".");
            decimalPart = decimalPart || "000";

            let decimalArray = decimalPart.split("");
            switch (aimPreference) {
                case "arm":
                    decimalArray[0] = newDigit;
                    break;
                case "wrist":
                    decimalArray[1] = newDigit;
                    break;
                case "finger":
                    decimalArray[2] = newDigit;
                    break;
                default:
                    break;
            }
            const newDecimalPart = decimalArray.join("");
            const newSensitivity = `${integerPart}.${newDecimalPart}`;

            return parseFloat(newSensitivity);
        };

        app.post("/convertToOriginalGame", async (req, res) => {
            const { newSensitivity, originalGameId } = req.body;
            const url = `${BASE_URL}?key=${config.sensitivity_key}&v=${API_VERSION}&query=calculate&gameid1=2347&sens1=${newSensitivity}&gameid2=${originalGameId}`;

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error("Failed to convert sensitivity back to original game");
                }
                const data = await response.json();
                const originalGameSensitivity = data[0]?.sens1 || newSensitivity;

                res.json({ originalGameSensitivity });
            } catch (error) {
                console.error("Error converting sensitivity back to original game:", error);
                res.status(500).json({ error: "Failed to convert sensitivity back to original game" });
            }
        });

        app.get("/calculateValue", async (req, res) => {
            try {
                const { gameid1, sens1, gameid2 } = req.query;

                let params = new URLSearchParams();
                params.append("key", config.sensitivity_key);
                params.append("v", "11.3.a");
                params.append("gameid1", gameid1);
                params.append("sens1", sens1);
                params.append("sens2", "");
                params.append("multi1", "");
                params.append("multi2", "");
                params.append("gameid2", gameid2);
                params.append("query", "calculate");

                let url = `${BASE_URL}?${params}`;

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error("Failed to fetch data from Mouse Sensitivity API");
                }
                const data = await response.json();
                res.json(data);
            } catch (error) {
                console.error("Error:", error);
                res.status(500).json({ error: "Failed to calculate value. Please try again." });
            }
        });

        app.get("/fetchGameNames", async (req, res) => {
            try {
                const { gameName } = req.query;
                const url = `https://www.mouse-sensitivity.com/senstailor/?key=${config.sensitivity_key
                    }&v=11.3.a&query=gamelist&game=${encodeURIComponent(gameName)}`;

                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error("Failed to fetch game names from Mouse Sensitivity API");
                }
                const data = await response.json();
                res.json(data);
            } catch (error) {
                console.error("Error:", error);
                res.status(500).json({ error: "Failed to verify game name. Please try again." });
            }
        });

        const calculateSensitivity = (calculatedSens, aimPreference, dpi) => {
            const valorantSens = Number(calculatedSens); // Ensure calculatedSens is a number
            let feedback;

            // Ensure we are working with a fixed decimal point value
            let focusValue = valorantSens.toFixed(3);
            let decimalPart = focusValue.split(".")[1]; // Get the decimal part of the sensitivity

            if (!decimalPart) {
                decimalPart = "000"; // Default to '000' if there's no decimal part
            }

            let selectedDigit;
            switch (aimPreference) {
                case "arm":
                    selectedDigit = decimalPart[0] || "0"; // First digit after decimal
                    break;
                case "wrist":
                    selectedDigit = decimalPart[1] || "0"; // Second digit after decimal
                    break;
                case "finger":
                    selectedDigit = decimalPart[2] || "0"; // Third digit after decimal
                    break;
                default:
                    selectedDigit = decimalPart[0] || "0"; // Default to first digit
                    break;
            }

            selectedDigit = parseInt(selectedDigit, 10); // Convert the selected digit to an integer

            const orientationMapping = {
                0: "48 minutes",
                1: "51 minutes",
                2: "54 minutes",
                3: "57 minutes",
                4: "60 minutes",
                5: "3 minutes",
                6: "6 minutes",
                7: "9 minutes",
                8: "12 minutes",
                9: "15 minutes",
            };

            const feedbackMapping = {
                0: {
                    pros: 'Neutral/flat grip for balance. The aiming preference you selected may be your "anchor point". You can either select a new aiming preference or senstailor will tailor a new sensitivity based on your current aiming preference.',
                    cons: "",
                },
                1: {
                    pros: "This sensitivity will have the fastest general aim and fastest reaction times as well as fastest precision.",
                    cons: "This sensitivity will be bad for tracking and you may undershoot at times. It also will be biased to left-hand side targets/shots and weaker at hitting right-hand side targets/shots.",
                },
                2: {
                    pros: "This sensitivity will have a balance between control, highest precision and even target selection on left and right.",
                    cons: 'This sensitivity has a low "range"/"field of aim" so it will undershoot and struggle with tracking.',
                },
                3: {
                    pros: "This sensitivity will have the best mouse control. You will feel a strong grip and be able to make high accuracy adjustments and 180s.",
                    cons: "This sensitivity will be bad for tracking and will undershoot. It also will be biased to left-hand side targets/shots and weaker at hitting right-hand side targets/shots.",
                },
                4: {
                    pros: "This sensitivity is great for flick aim and spray transfers.",
                    cons: "This sensitivity will look shaky and can be very inconsistent.",
                },
                5: {
                    pros: "This sensitivity has the best all-round aim. It's the most consistent for tracking, flicking, and precision aim. It also has even target selection on left and right.",
                    cons: "This sensitivity has a very high skill ceiling to master and get desired effects. It can look very shaky.",
                },
                6: {
                    pros: "This sensitivity will have the highest first shot accuracy and tracking.",
                    cons: "This sensitivity will feel extremely shaky and inconsistent.",
                },
                7: {
                    pros: 'The sensitivity has great focus/looks stable and is great for movement and rhythm-based aiming. It also has a range/"field of aim".',
                    cons: "This sensitivity may cause you to overshoot.",
                },
                8: {
                    pros: 'The sensitivity will have "pencil aim". It\'s amazing for prefiring, adjustments, tracking, flicking and has very high mouse control. It also has even target selection on left and right.',
                    cons: "This sensitivity will cause you to overshoot. It can feel very shaky and inconsistent and the movement can be sloppy at times.",
                },
                9: {
                    pros: "This sensitivity has the largest field of aim. It's very fast for adjustments and reaction time. It can also be great for movement and prefiring.",
                    cons: "This sensitivity will be bad for micro-adjustments/precision. At times it will feel inconsistent and shaky and overshoot a lot.",
                },
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

        app.post("/convertSensitivity", (req, res) => {
            const { calculatedSens, aimPreference, dpi } = req.body;
            try {
                const result = calculateSensitivity(calculatedSens, aimPreference, dpi);
                const { valorantSens, feedback } = result;

                res.json({
                    valorantSens: valorantSens,
                    feedback: feedback,
                });
            } catch (error) {
                console.error("Error:", error);
                res.status(500).json({ error: "Failed to calculate sensitivity. Please try again." });
            }
        });

        const generateZigzagImage = (width, height, sensitivity) => {
            const canvas = createCanvas(width, height);
            const context = canvas.getContext("2d");

            context.fillStyle = "white";
            context.fillRect(0, 0, width, height);

            context.strokeStyle = "black";
            context.lineWidth = 2;

            context.beginPath();
            let x = width / 2;
            let y = height / 2;
            context.moveTo(x, y);

            const step = 50; // Define step size for the zigzag pattern

            // Extract the digits after the decimal point in the sensitivity
            const decimalPart = sensitivity.split(".")[1];
            if (!decimalPart) {
                throw new Error("Invalid sensitivity value");
            }

            const orientationMapping = {
                1: 17,
                2: 34,
                3: 51,
                4: 68,
                5: 90,
                6: 107,
                7: 124,
                8: 141,
                9: 158,
                0: 0, // Assuming 0 degrees for 0, you can adjust as needed
            };

            // First digit (after decimal point)
            let firstDigit = parseInt(decimalPart[0], 10);
            let firstAngle = (orientationMapping[firstDigit] * Math.PI) / 180;
            x += step * Math.cos(firstAngle);
            y += step * Math.sin(firstAngle);
            context.lineTo(x, y);

            // Second digit (should start from the beginning again)
            x = width / 2;
            y = height / 2;
            context.moveTo(x, y);
            let secondDigit = parseInt(decimalPart[1], 10);
            let secondAngle = (orientationMapping[secondDigit] * Math.PI) / 180;
            x += step * Math.cos(secondAngle);
            y += step * Math.sin(secondAngle);
            context.lineTo(x, y);

            // Third digit (continues from the end of the second digit)
            let thirdDigit = parseInt(decimalPart[2], 10);
            let thirdAngle = (orientationMapping[thirdDigit] * Math.PI) / 180;
            x += step * Math.cos(thirdAngle);
            y += step * Math.sin(thirdAngle);
            context.lineTo(x, y);

            context.stroke();

            return canvas.toBuffer();
        };

        // Express route to handle the image generation request
        app.get("/generateZigzag", (req, res) => {
            try {
                const { width, height, sensitivity } = req.query;

                if (isNaN(width) || isNaN(height)) {
                    throw new Error("Invalid input parameters");
                }

                const zigzagImage = generateZigzagImage(parseInt(width), parseInt(height), sensitivity);
                console.log("Generated zigzag image successfully");

                res.setHeader("Content-Type", "image/png");
                res.send(zigzagImage);
            } catch (error) {
                console.error("Error generating zigzag image:", error);
                res.status(500).json({ error: "Failed to generate zigzag image. Please try again." });
            }
        });

        // OpenAI GPT-TURBO-3.5
        app.post("/generateMessage", async (req, res) => {
            const { prompt } = req.body;
            try {
                const completion = await openai.chat.completions.create({
                    messages: [{ role: "system", content: prompt }],
                    model: "gpt-3.5-turbo",
                });

                const message = completion?.choices[0]?.message;
                res.json({ message });
            } catch (error) {
                console.error("Error generating message:", error);
                res.status(500).json({ error: "Failed to generate message" });
            }
        });

        app.post("/chat", async (req, res) => {
            const userMessage = `I'm a knowledgeable virtual assistant with extensive experience in providing tailored advice on various topics, including gaming-related queries. 
            
            Your task today involves making a suggestion to optimize mouse sensitivity for gaming using the mouse-sensitivity API. Kindly consider the user input provided: "${req.body.message}".
            
            Before generating a response, remember to take into account the user's specific gaming preferences, playstyle, and any additional details they might have provided. 
            
            For example, if a user mentions a preference for FPS games requiring quick reflexes, you can suggest a lower sensitivity setting for better precision during intense combat scenarios.
            
            We have predefined dictionary Heres:

            0: Neutral/flat grip for balance. The aiming preference you selected may be your "anchor point". You can either select a new aiming preference or senstailor will tailor a new sensitivity based on your current aiming preference.

            1: Pros: will have the fastest general aim and fastest reaction times as well as fastest precision.

            Cons: This sensitivity will be bad for tracking and you may undershoot at times. It also will be biased to left-hand side targets/shots and weaker at hitting right-hand side targets/shots.

            2: pros: This sensitivity will have a balance between control, highest precision and even target selection on left and right.
            
            cons: This sensitivity has a low "range"/"field of aim" so it will undershoot and struggle with tracking.

            3: pros: This sensitivity will have the best mouse control. You will feel a strong grip and be able to make high accuracy adjustments and 180s.
            
            cons: This sensitivity will be bad for tracking and will undershoot. It also will be biased to left-hand side targets/shots and weaker at hitting right-hand side targets/shots.

            4: pros: This sensitivity is great for flick aim and spray transfers.
            
            cons: This sensitivity will look shaky and can be very inconsistent.

            5: pros: This sensitivity has the best all-round aim. It's the most consistent for tracking, flicking, and precision aim. It also has even target selection on left and right.

            cons: This sensitivity has a very high skill ceiling to master and get desired effects. It can look very shaky.

            6: pros: This sensitivity will have the highest first shot accuracy and tracking.

            cons: This sensitivity will feel extremely shaky and inconsistent.

            7: pros: The sensitivity has great focus/looks stable and is great for movement and rhythm-based aiming. It also has a range/"field of aim".
            
            cons: This sensitivity may cause you to overshoot.

            8: pros: The sensitivity will have "pencil aim". It\'s amazing for prefiring, adjustments, tracking, flicking and has very high mouse control. It also has even target selection on left and right.
            
            cons: This sensitivity will cause you to overshoot. It can feel very shaky and inconsistent and the movement can be sloppy at times.

            9: pros: This sensitivity has the largest field of aim. It's very fast for adjustments and reaction time. It can also be great for movement and prefiring.

            cons: This sensitivity will be bad for micro-adjustments/precision. At times it will feel inconsistent and shaky and overshoot a lot
            
            
            Based on these pros and cons, you will give me the suggestions.

            `;

            try {
                const response = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${config.openapi_key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "gpt-3.5-turbo",
                        messages: [{ role: "user", content: userMessage }],
                    }),
                });

                const data = await response.json();
                const gptMessage = data.choices[0].message.content;
                res.json({ response: gptMessage });
            } catch (error) {
                console.error("Error:", error);
                res.status(500).json({ error: "Something went wrong" });
            }
        });


        app.get("/fetchGameList", async (req, res) => {
            try {
                const response = await fetch(`${BASE_URL}?key=${config.sensitivity_key}&v=${API_VERSION}&query=gamelist`);
                const data = await response.json();
                res.json(data);
            } catch (error) {
                console.error('Error fetching game list:', error);
                res.status(500).json({ error: 'Failed to fetch game list' });
            }
        });

        app.get("/calculateToValorantValue", async (req, res) => {
            const { gameid1, sens1 } = req.query;
            try {
                const response = await fetch(`${BASE_URL}?key=${config.sensitivity_key}&v=${API_VERSION}&query=calculate&gameid1=${gameid1}&sens1=${sens1}&gameid2=2347`);
                const data = await response.json();
                res.json(data);
            } catch (error) {
                console.error('Error calculating sensitivity:', error);
                res.status(500).json({ error: 'Failed to calculate sensitivity' });
            }
        });

        app.post("/translate_game", async (req, res) => {
            const { prompt } = req.body;

            try {
                const response = await openai.chat.completions.create({
                    messages: [{ role: "user", content: prompt }],
                    model: "gpt-3.5-turbo",
                });

                const translatedData = response?.choices[0]?.message?.content;

                res.json({ translatedData });
            } catch (error) {
                console.error("Error translating game data:", error);
                res.status(500).json({ error: "Failed to translate game data" });
            }
        });


        app.post('/create-payment-intent', async (req, res) => {
            const { plan } = req.body;

            let amount;
            switch (plan) {
                case 'dev':
                    amount = 0;
                    break;
                case 'pro':
                    amount = 1000; // $10.00 in cents
                    break;
                case 'enterprise':
                    amount = 5000; // Custom amount example, you can set it as per your need
                    break;
                default:
                    return res.status(400).json({ error: 'Invalid plan selected' });
            }

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount,
                    currency: 'usd',
                    automatic_payment_methods: {
                        enabled: true,
                    },
                });
                res.status(200).json({ clientSecret: paymentIntent.client_secret });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });


        app.post("/post_comment", async (req, res) => {
            const { email, name, comment } = req.body;
            if (!comment || !email || !name) {
                return res.status(400).json({ message: "Comment, email, and name are required" });
            }

            try {
                // Check if user exists, if not create a new user
                let user = await usersCollection.findOne({ email });
                if (!user) {
                    user = await usersCollection.insertOne({ email, name });
                }

                // Insert comment
                const result = await commentsCollection.insertOne({
                    email,
                    name,
                    comment,
                    createdAt: new Date(),
                });

                res.status(201).json({ message: "Comment posted successfully", result });
            } catch (error) {
                res.status(500).json({ message: "Error posting comment", error });
            }
        });

        app.get("/get_comments", async (req, res) => {
            try {
                const comments = await commentsCollection.find().toArray();
                res.status(200).json(comments);
            } catch (error) {
                res.status(500).json({ message: "Error fetching comments", error });
            }
        });


    } catch (err) {
        console.error(err);
    }
}

main().catch(console.error);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
