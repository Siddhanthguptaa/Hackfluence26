/**
 * Simple test script to verify ProfileIdentification API availability
 * Usage: node test-linkedin-api.js
 */

const baseUrl = 'https://7005d0347fac.ngrok-free.app';

async function testProfileIdentificationAPI() {
  console.log('Testing ProfileIdentification API at:', baseUrl);
  
  try {
    // Test the ProfileIdentification API (POST request)
    const testUrl = `${baseUrl}/get-user-info`;
    console.log('Testing URL:', testUrl);
    
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ username: 'bill.d.lu' }),
      signal: AbortSignal.timeout(60000) // 30 second timeout - API might be slow
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      console.error('API returned error status:', response.status);
      const text = await response.text();
      console.error('Error response body:', text);
      return false;
    }
    
    const data = await response.json();
    console.log('Success! API response:', JSON.stringify(data, null, 2));
    
    // Handle both success and error response formats
    if (data.success === false) {
      console.log('🔍 API returned error - this reveals API is working but profile not found');
      console.log('Error:', data.error);
      console.log('Username tested:', data.username);
      console.log('✅ ProfileIdentification API endpoint is functional');
      return true; // API is working, just no data for this username
    }
    
    // Validate expected success shape - expecting ProfileIdentification format
    if (typeof data.name === 'string' && typeof data.data === 'string') {
      console.log('✅ ProfileIdentification API is working correctly with profile data');
      console.log('Real name:', data.name);
      console.log('Handle:', data.handle);
      console.log('Bio:', data.bio);
      console.log('Labels:', data.labels);
      return true;
    } else {
      console.error('❌ API response has unexpected success shape - expected { name: string, data: string, ... }');
      console.log('Actual keys:', Object.keys(data));
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error testing ProfileIdentification API:', error.message);
    
    if (error.name === 'AbortError') {
      console.error('   → Request timed out - API may not be running');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('   → Connection refused - API service is not running');
    } else if (error.code === 'ENOTFOUND') {
      console.error('   → Host not found - check if endpoint is accessible');
    }
    
    return false;
  }
}

// Also test if the service is at least listening
async function testServiceAvailability() {
  try {
    const response = await fetch(baseUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(60000)
    });
    console.log('Base URL responds with status:', response.status);
    return true;
  } catch (error) {
    console.log('Base URL test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('=== ProfileIdentification API Diagnostics ===\n');
  
  console.log('1. Testing service availability...');
  const serviceAvailable = await testServiceAvailability();
  
  console.log('\n2. Testing ProfileIdentification API endpoint...');
  const apiWorking = await testProfileIdentificationAPI();
  
  console.log('\n=== Summary ===');
  if (apiWorking) {
    console.log('✅ ProfileIdentification API is fully functional');
    console.log('The LinkedIn research integration should now work properly.');
  } else if (serviceAvailable) {
    console.log('⚠️  Service is running but ProfileIdentification endpoint may have issues');
  } else {
    console.log('❌ ProfileIdentification API service appears to be down');
    console.log('\n💡 To fix:');
    console.log('   1. Make sure the ProfileIdentification service is running');
    console.log('   2. Check if the service is accessible at https://7005d0347fac.ngrok-free.app');
    console.log('   3. Verify the /get-user-info endpoint is implemented correctly');
  }
}

main().catch(console.error);