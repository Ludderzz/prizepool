const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

async function scrapePricesFromUrl(url) {
    try {
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(html);
        
        let totalForUrl = 0;
        const foundPrices = [];
        const keywords = ['cash', 'credit', 'another go', 'site credit'];

        $('h4').each((_, element) => {
            const h4Text = $(element).text().toLowerCase();
            const matchesKeyword = keywords.some(keyword => h4Text.includes(keyword));

            if (matchesKeyword) {
                const fullText = $(element).text();
                
                const itemContainer = $(element).closest('li, .elementor-element, .prize-item, article') 
                    .length ? $(element).closest('li, .elementor-element, .prize-item, article') 
                    : $(element).parent();

                let baseAmount = 0;
                let isPriceFound = false;

                if (h4Text.includes('another go')) {
                    const spanText = $(element).find('span').text() || $(element).next('span').text() || itemContainer.find('span').text();
                    const spanMatch = spanText.match(/£\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2})?)/);
                    
                    if (spanMatch) {
                        baseAmount = parseFloat(spanMatch[1].replace(/,/g, ''));
                        isPriceFound = true;
                    }
                }

                if (!isPriceFound) {
                    const priceRegex = /£\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]{2})?/g;
                    const match = priceRegex.exec(fullText);
                    if (match) {
                        baseAmount = parseFloat(match[1].replace(/,/g, ''));
                        isPriceFound = true;
                    }
                }

                if (isPriceFound && !isNaN(baseAmount) && baseAmount > 0) {
                    let multiplier = 1;
                    let remainingText = '1/1';

                    let remMatch = null;
                    itemContainer.find('*').each((_, subEl) => {
                        if (remMatch) return;
                        const subText = $(subEl).clone().children().remove().end().text().trim();
                        const match = subText.match(/\b([0-9]+)\s*\/\s*([0-9]+)\b/);
                        if (match) {
                            remMatch = match;
                            remainingText = match[0];
                        }
                    });

                    if (!remMatch) {
                        const containerText = itemContainer.text();
                        const match = containerText.match(/\b([0-9]+)\s*\/\s*([0-9]+)\b/);
                        if (match) {
                            remMatch = match;
                            remainingText = match[0];
                        }
                    }

                    if (remMatch) {
                        multiplier = parseInt(remMatch[1], 10);
                    }

                    if (isNaN(multiplier) || multiplier < 0) {
                        multiplier = 1;
                    }

                    const finalAmount = baseAmount * multiplier;
                    totalForUrl += finalAmount;

                    foundPrices.push({
                        text: fullText.trim(),
                        baseAmount: baseAmount,
                        multiplier: multiplier,
                        remainingText: remainingText,
                        amount: finalAmount
                    });
                }
            }
        });

        return {
            url,
            success: true,
            prices: foundPrices,
            subtotal: Number(totalForUrl.toFixed(2))
        };
    } catch (error) {
        return {
            url,
            success: false,
            error: error.message,
            prices: [],
            subtotal: 0
        };
    }
}

app.post('/api/scan', async (req, res) => {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: 'Please provide an array of URLs.' });
    }

    let grandTotal = 0;
    const results = [];

    for (const url of urls) {
        if (!url.trim()) continue;
        const result = await scrapePricesFromUrl(url.trim());
        grandTotal += result.subtotal;
        results.push(result);
    }

    res.json({
        results,
        grandTotal: Number(grandTotal.toFixed(2))
    });
});

// Local testing fallback vs Vercel serverless export
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Crucial for Vercel
module.exports = app;