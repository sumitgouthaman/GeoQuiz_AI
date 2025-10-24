import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Question, GroundingChunk, CountryInfo, Country } from "../types";
import { COUNTRIES } from "../constants";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const getRandomCountry = async (): Promise<Country> => {
    const randomIndex = Math.floor(Math.random() * COUNTRIES.length);
    return Promise.resolve(COUNTRIES[randomIndex]);
};

export const getHint = async (question: Question): Promise<string> => {
  let prompt: string;
  if (question.type === 'ask_capital') {
    prompt = `Give me a single, short, one-sentence hint for a capital of ${question.country.name}. Do not include any of the following names in your answer: ${question.country.capital.join(', ')}.`;
  } else {
    prompt = `Give me a single, short, one-sentence hint for the country whose capital is ${question.capitalInQuestion}. Do not include the name '${question.country.name}' in your answer.`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error fetching hint:", error);
    return "Sorry, I couldn't fetch a hint right now. Please try again.";
  }
};

export const getCountryInfo = async (country: string, capitals: string[]): Promise<{ info: CountryInfo | null; sources: GroundingChunk[] }> => {
  const prompt = `Provide information about ${country} and its capital(s) ${capitals.join(' and ')}. Return a JSON object with the following structure:
- "summary": A succinct, one-paragraph summary.
- "facts": An array of 2-3 short, fun, memorable facts.
- "mapQuery": A string suitable for a Google Maps search query to locate the country (e.g., "France").
- "photoPrompt": A detailed, descriptive prompt for an AI image generator to create a single, beautiful, realistic photograph representing the country's landscape or a famous landmark in its capital.

Use both Google Search and Google Maps for grounding.`;
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
      },
    });

    let jsonString = response.text;
    
    // The model might wrap the JSON in markdown backticks.
    const markdownMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
      jsonString = markdownMatch[1];
    } else {
      // Or it might just be a raw string that needs trimming to the JSON object.
      const firstBrace = jsonString.indexOf('{');
      const lastBrace = jsonString.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonString = jsonString.substring(firstBrace, lastBrace + 1);
      }
    }

    const info = JSON.parse(jsonString) as CountryInfo;
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    return { info, sources };
  } catch (error) {
    console.error("Error fetching country info:", error);
    return {
      info: null,
      sources: []
    };
  }
};

export const getCountryImage = async (prompt: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    for (const part of response.candidates?.[0]?.content.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
};