const fs = require('fs');
const axios = require('axios');

const OLLAMA_URL = 'http://172.16.0.170:11434/api/embeddings';
const MODEL = 'llama3';

async function main() {
  const text = fs.readFileSync('test.txt', 'utf-8').trim();

  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt: text
    });

    console.log('Embedding vector:', response.data.embedding);
  } catch (error) {
    console.error('Error fetching embedding:', error.response?.data || error.message);
  }
}

main();
