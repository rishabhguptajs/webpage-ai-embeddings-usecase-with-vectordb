import axios from "axios";
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import { ChromaClient } from "chromadb";

dotenv.config();

const genai = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: "text-embedding-004",
    taskType: TaskType.RETRIEVAL_DOCUMENT
});

const chromaClient = new ChromaClient({ 
    path: 'http://localhost:8000'
});

const WEB_COLLECTION = `WEB_SCRAPED_DATA_COLLECTION-1`;

async function scrapeWebpage(url) {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        
        const pageHead = $('head').html() || '';
        const pageTitle = $('title').text() || '';
        const pageBody = $('body').html() || '';

        const internalLinks = new Set();
        const externalLinks = new Set();

        $('a').each((_, el) => {
            const link = $(el).attr('href');
            if (!link) return;
            if (link === '/') return;

            if (link.startsWith('http') || link.startsWith('https')) {
                externalLinks.add(link);
            } else {
                internalLinks.add(link);
            }
        });
        
        return {
            head: pageHead,
            title: pageTitle,
            body: pageBody,
            internalLinks: Array.from(internalLinks),
            externalLinks: Array.from(externalLinks),
        };
    } catch (error) {
        console.error(`Error scraping ${url}:`, error);
        return {
            head: '',
            title: '',
            body: '',
            internalLinks: [],
            externalLinks: [],
        };
    }
}

async function generateVectorEmbeddings({ text }) {
    try {
        const embeddings = await genai.embedDocuments([text]);
        return embeddings[0];
    } catch (error) {
        console.error('Error generating embeddings:', error);
        throw error;
    }
}

async function insertIntoDB({ embedding, url, body = '', head = '' }) {
    try {
        const collection = await chromaClient.getOrCreateCollection({
            name: WEB_COLLECTION,
        });

        await collection.add({
            ids: [url],
            embeddings: [embedding],
            metadatas: [{ url, body, head }],
        });
    } catch (error) {
        console.error('Error inserting into DB:', error);
        throw error;
    }
}

function chunkText(text, size) {
    if (typeof text !== "string" || typeof size !== "number" || size <= 0) {
        throw new Error("Invalid input: text must be a string and size must be a positive number.");
    }
    
    let chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.substring(i, i + size));
    }
    
    return chunks;
}

async function ingest(url = '') {
    if (!url) {
        throw new Error('URL is required');
    }

    console.log(`🌟 Ingesting ${url}`);
    try {
        const { head, body, internalLinks } = await scrapeWebpage(url);

        const headEmbedding = await generateVectorEmbeddings({ text: head });
        await insertIntoDB({ embedding: headEmbedding, url, head });

        const bodyChunks = chunkText(body, 1000);

        for (const chunk of bodyChunks) {
            const bodyEmbedding = await generateVectorEmbeddings({ text: chunk });        
            await insertIntoDB({ embedding: bodyEmbedding, url, head, body: chunk });
        }

        // Recursive ingestion commented out to prevent infinite loops
        // for(const link of internalLinks){
        //     const _url = `${url}${link}`;
        //     await ingest(_url);     
        // }

        console.log(`🚀 Ingesting Success ${url}`);
    } catch (error) {
        console.error(`❌ Error ingesting ${url}:`, error);
        throw error;
    }
}

async function chat(question = '') {
    if (!question) {
        throw new Error('Question is required');
    }

    try {
        const questionEmbedding = await generateVectorEmbeddings({ text: question });

        const collection = await chromaClient.getOrCreateCollection({
            name: WEB_COLLECTION,
        });

        const collectionResult = await collection.query({
            queryEmbeddings: [questionEmbedding],
            nResults: 3,
        });

        return collectionResult.metadatas[0]; // Return first result instead of logging all
    } catch (error) {
        console.error('Error in chat:', error);
        throw error;
    }
}

// Example usage
chat('Who is Rishabh').then(console.log).catch(console.error);