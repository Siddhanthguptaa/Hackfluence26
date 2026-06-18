/**
 * Test Instagram real name extraction from og:title
 * Usage: node test-instagram-extraction.js
 */

async function testInstagramExtraction() {
  console.log('=== Instagram Real Name Extraction Test ===\n');
  
  const testUsernames = ['bill.d.lu'];
  
  for (const username of testUsernames) {
    try {
      console.log(`Testing username: ${username}`);
      
      const instagramUrl = `https://www.instagram.com/${username}/`;
      console.log(`Fetching: ${instagramUrl}`);
      
      const response = await fetch(instagramUrl, {
  "headers": {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-GB,en;q=0.9",
    "dpr": "1.5",
    "priority": "u=0, i",
    "sec-ch-prefers-color-scheme": "dark",
    "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Microsoft Edge\";v=\"140\"",
    "sec-ch-ua-full-version-list": "\"Chromium\";v=\"140.0.7339.81\", \"Not=A?Brand\";v=\"24.0.0.0\", \"Microsoft Edge\";v=\"140.0.3485.54\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-model": "\"\"",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-ch-ua-platform-version": "\"19.0.0\"",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "viewport-width": "1168",
    "cookie": "csrftoken=T1d_-B3LnpLIIZvVmY30jy; datr=YcDGaPYlRfbzbrlJb1S-IY9V; ig_did=774A9ED1-941A-4556-BACC-D214835F992B; ig_nrcb=1; dpr=1.5; mid=aMbAYgALAAElJlptWN6-qHsoD5uP; ps_l=1; ps_n=1; wd=1168x941"
  },
  "body": null,
  "method": "GET",
    signal: AbortSignal.timeout(15000)
});
      console.log(`Response status: ${response.status}`);
      
      if (!response.ok) {
        console.log(`❌ Failed to fetch Instagram page for ${username}`);
        console.log('');
        continue;
      }
      
      const html = await response.text();
      
      // Debug: Show first part of HTML and search for various title patterns
      console.log('HTML snippet (first 1000 chars):');
      console.log(html.substring(0, 1000));
      console.log('\n--- Searching for title patterns ---');
      
      // Try multiple title extraction patterns
      const patterns = [
        { name: 'og:title', regex: /<meta\s+property="og:title"\s+content="([^"]+)"/i },
        { name: 'name=title', regex: /<meta\s+name="title"\s+content="([^"]+)"/i },
        { name: 'title tag', regex: /<title>([^<]+)<\/title>/i },
        { name: 'og:title single quotes', regex: /<meta\s+property='og:title'\s+content='([^']+)'/i },
        { name: 'JSON title', regex: /"title":"([^"]+)"/i },
        { name: 'JSON full_name', regex: /"full_name":"([^"]+)"/i },
        { name: 'JSON username', regex: /"username":"([^"]+)"/i },
      ];
      
      let extractedTitle = null;
      let patternUsed = null;
      
      for (const pattern of patterns) {
        const match = html.match(pattern.regex);
        if (match) {
          extractedTitle = match[1];
          patternUsed = pattern.name;
          console.log(`✅ Found title using ${patternUsed}: "${extractedTitle}"`);
          break;
        }
      }
      
      if (!extractedTitle) {
        console.log(`❌ Could not find any title patterns for ${username}`);
        
        // Look for any meta tags to understand structure
        const metaTags = html.match(/<meta[^>]+>/gi);
        if (metaTags) {
          console.log('Available meta tags:');
          metaTags.slice(0, 10).forEach(tag => console.log('  ', tag));
          if (metaTags.length > 10) {
            console.log(`  ... and ${metaTags.length - 10} more`);
          }
        }
        
        console.log('');
        continue;
      }
      
      // Extract real name by splitting on '(' and taking first segment
      const realName = extractedTitle.split('(')[0].trim();
      
      if (!realName) {
        console.log(`❌ Could not extract real name from title for ${username}`);
        console.log('');
        continue;
      }
      
      console.log(`✅ Extracted real name: "${realName}"`);
      console.log(`Instagram username: ${username} → Real name: ${realName}`);
      console.log('');
      
    } catch (error) {
      console.log(`❌ Error testing ${username}:`, error.message);
      
      if (error.name === 'AbortError') {
        console.log('   → Request timed out');
      } else if (error.code === 'ECONNREFUSED') {
        console.log('   → Connection refused');
      }
      
      console.log('');
    }
  }
}

async function main() {
  await testInstagramExtraction();
  
  console.log('=== Test Summary ===');
  console.log('🔍 Debugging Instagram HTML structure to understand available data');
  console.log('📝 This will help refine the extraction approach');
}

main().catch(console.error);