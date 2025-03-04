import axios from "axios";
import * as cheerio from 'cheerio';

async function scrapeWebpage(url){
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    
    const pageHead = $('head').html();
    const pageTitle = $('title').text();
    const pageBody = $('body').html();

    const internalLinks = [];
    const externalLinks = [];

    $('a').each((_, el) => {
        const link = $(el).attr('href');

        if(link === '/') return;

        if(link.startsWith('http') || link.startsWith('https')){
            externalLinks.push(link);
        } else {
            internalLinks.push(link);
        }
    })

    return {
        head: pageHead,
        title: pageTitle,
        body: pageBody,
        internalLinks,
        externalLinks
    }
}

async function generateVectorEmbeddings(){}

scrapeWebpage('https://rishabhguptajs.vercel.app').then(console.log)