import { createCanvas } from "canvas";
import cors from "cors";
import express from "express";
import { MongoClient } from "mongodb";
import fetch from "node-fetch";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
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
        allowedHeaders: "Content-Type",
    })
);

app.use(express.json());
app.use("/public", express.static(path.join(__dirname, "public")));

const openai = new OpenAI(config.sensitivity_key);

app.get("/get_user_login", (req, res) => {
    res.json({ message: "Login endpoint" });
});

async function main() {
    try {

        await client.connect();
        console.log('MongoDB connected');
        const database = client.db('ai-calculator');
        const usersCollection = database.collection('users');

        // API endpoint to store user data
        app.post('/save_user_data', async (req, res) => {
            const { email, answers } = req.body;
            try {
                const result = await usersCollection.insertOne({ email, answers });
                res.status(200).json({ message: 'User data saved successfully', result });
            } catch (error) {
                res.status(500).json({ message: 'Error saving user data', error });
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
                // console.log(data)
            } catch (error) {
                console.error("Error:", error);
                res.status(500).json({ error: "Failed to verify game name. Please try again." });
            }
        });

        const calculateSensitivity = (calculatedSens, aimPreference, dpi) => {
            const valorantSens = Number(calculatedSens); // Ensure calculatedSens is a number
            // console.log(`Valorant Sensitivity: ${valorantSens}`);
            let feedback;

            // Ensure we are working with a fixed decimal point value
            let focusValue = valorantSens.toFixed(3);
            let decimalPart = focusValue.split(".")[1]; // Get the decimal part of the sensitivity

            // console.log(`Decimal Part: ${decimalPart}`);

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

            console.log(`Selected Digit (Integer): ${selectedDigit}`);

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

            // console.log('Generated feedback:', feedback); // Log the feedback

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

                // console.log('Returning result:', { valorantSens, feedback }); // Log the result being returned

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
            const userMessage = req.body.message;

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
    } catch (err) {
        console.error(err);
    }
}

main().catch(console.error);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
