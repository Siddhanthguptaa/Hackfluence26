import { jsonError, jsonSuccess, safeJson } from '@/lib/api'

interface GeneratePostRequest {
  suggestions: Array<{
    id: string
    type: string
    content: string
    confidence: number
    reasoning: string
  }>
  colorPalette: Array<{
    hex: string
    name: string
  }>
  brandAnalysis: string[]
}

export async function POST(request: Request) {
  try {
    const parsed = await safeJson<GeneratePostRequest>(request)
    if (!parsed.ok) return parsed.response

    const { suggestions, colorPalette, brandAnalysis } = parsed.value

    // Generate AI-powered post content
    const generatedPost = await generatePostContent(suggestions, colorPalette, brandAnalysis)
    
    return jsonSuccess(generatedPost)
  } catch (error: any) {
    console.error('Error generating post:', error)
    return jsonError('Failed to generate post', 500, { detail: error?.message })
  }
}

async function generatePostContent(
  suggestions: GeneratePostRequest['suggestions'],
  colorPalette: GeneratePostRequest['colorPalette'],
  brandAnalysis: string[]
) {
  // Get Martian API key from environment variables
  const martianApiKey = process.env.MARTIAN_API_KEY || 'sk-eac6e046df6042eaa86297d8e6820da3'
  
  // Prepare the prompt for AI post generation
  const prompt = `You are an AI content creator specializing in Instagram marketing. Based on the provided suggestions, color palette, and brand analysis, generate a complete Instagram post that's personalized and engaging.

BRAND ANALYSIS:
${brandAnalysis.map(item => `• ${item}`).join('\n')}

COLOR PALETTE:
${colorPalette.map(color => `• ${color.hex} (${color.name})`).join('\n')}

SUGGESTIONS:
${suggestions.map(s => `• ${s.content} (${s.type}, ${Math.round(s.confidence * 100)}% confidence)`).join('\n')}

Generate a complete Instagram post that:
1. Uses the brand analysis to create a compelling, personalized caption (2-3 sentences)
2. Incorporates relevant hashtags (5-8 hashtags) based on the content theme
3. Includes appropriate mention suggestions (@username) based on the brand analysis
4. Provides specific post timing recommendations based on the content type
5. Suggests visual style improvements using the color palette
6. Includes a strong call-to-action that matches the content theme

Make the post feel authentic and tailored to the specific brand and content shown. Be creative but professional.

Format your response as JSON with this exact structure:
{
  "caption": "Your generated caption here...",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "mentions": ["@username1", "@username2"],
  "timing": "Best time to post: [specific recommendation]",
  "visualStyle": "Visual style recommendations based on color palette",
  "cta": "Call-to-action suggestion"
}

IMPORTANT: Respond with ONLY valid JSON. No markdown formatting, no explanations, just the raw JSON object.`

  try {
    const requestBody = {
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a social media content creator specializing in Instagram marketing. You MUST respond with ONLY valid JSON format. Do not include any explanatory text, markdown formatting, or code blocks. Just return the raw JSON object.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    }
    
    const response = await fetch('https://api.withmartian.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${martianApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Martian API error: ${response.status} ${response.statusText} - ${errorText}`)
    }
    
    const data = await response.json()
    let content = data.choices?.[0]?.message?.content
    
    if (!content) {
      throw new Error('No content received from AI')
    }
    
    // Clean up the response to ensure it's valid JSON
    content = content.trim()
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    }
    if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    const generatedPost = JSON.parse(content)
    
    // Validate and structure the response
    return {
      caption: generatedPost.caption || "Check out our latest content! 🚀 #summer2025 #innovation",
      hashtags: generatedPost.hashtags || ["#summer2025", "#innovation", "#tech", "#lifestyle", "#trending"],
      mentions: generatedPost.mentions || ["@universityofwaterloo", "@universityoflaurier"],
      timing: generatedPost.timing || "Best time to post: 6-8 PM on weekdays, 10-11 AM on weekends",
      visualStyle: generatedPost.visualStyle || "Use the blue color palette to maintain brand consistency and trust",
      cta: generatedPost.cta || "Check out the link in our bio for more details!",
      generatedAt: new Date().toISOString()
    }
    
  } catch (error) {
    console.error('Error calling Martian API:', error)
    
    // Return generic fallback data if API fails
    return {
      caption: "Excited to share this with you! 🚀 Looking forward to your thoughts and feedback. #content #marketing #socialmedia",
      hashtags: ["#content", "#marketing", "#socialmedia", "#engagement", "#community", "#brand", "#creative"],
      mentions: ["@yourbrand", "@collaborator"],
      timing: "Best time to post: 6-8 PM on weekdays, 10-11 AM on weekends",
      visualStyle: "Maintain consistent brand colors and high-quality visuals",
      cta: "Check out the link in our bio for more details!",
      generatedAt: new Date().toISOString()
    }
  }
}
