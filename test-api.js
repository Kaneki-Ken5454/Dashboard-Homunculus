import { createReadStream } from 'fs';
import { createServer } from 'http';

// Simple test using built-in modules
async function testAPI() {
  try {
    // Test health endpoint
    console.log('Testing health endpoint...');
    
    const healthResponse = await fetch('http://localhost:5000/api/health');
    const healthData = await healthResponse.json();
    console.log('Health check:', healthData);

    // Test neon-query endpoint
    console.log('Testing neon-query endpoint...');
    
    const queryResponse = await fetch('http://localhost:5000/api/neon-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getGuildStats'
      })
    });
    const queryData = await queryResponse.json();
    console.log('Guild stats:', queryData);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAPI();
