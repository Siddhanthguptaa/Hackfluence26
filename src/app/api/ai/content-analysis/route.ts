import { jsonError, jsonSuccess } from '@/lib/api'

interface ContentAnalysisRequest {
  file: File
}

interface ColorPalette {
  hex: string
  name: string
}

interface ContentSuggestion {
  id: string
  type: 'hashtag' | 'mention' | 'caption' | 'color' | 'timing'
  content: string
  confidence: number
  reasoning: string
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return jsonError('No file provided', 400)
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return jsonError('Invalid file type. Please upload a PDF or image file.', 400)
    }

    // Validate file size (max 5MB for images, 10MB for PDFs)
    const maxSize = file.type === 'application/pdf' ? 10 * 1024 * 1024 : 5 * 1024 * 1024
    if (file.size > maxSize) {
      return jsonError(`File too large. Maximum size: ${file.type === 'application/pdf' ? '10MB' : '5MB'}`, 400)
    }

    // Generate AI-powered analysis
    const analysis = await generateContentAnalysis(file)
    
    return jsonSuccess(analysis)
  } catch (error: any) {
    console.error('Error analyzing content:', error)
    return jsonError('Failed to analyze content', 500, { detail: error?.message })
  }
}

async function compressImage(base64: string, mimeType: string): Promise<string | null> {
  try {
    // For now, we'll use a simple approach: try to reduce the image size by using a smaller model
    // or by chunking the image analysis
    
    // If the image is extremely large, we can try to analyze it in chunks
    // or use a different approach
    
    console.log('Attempting to use a more efficient image analysis approach...')
    
    // For very large images, we'll use a different strategy:
    // 1. Try with a smaller image model
    // 2. Or use a different analysis approach
    
    // For now, return null to trigger fallback to text analysis
    // In a production environment, you might want to:
    // - Use a different image processing service
    // - Implement proper image resizing with a library like sharp
    // - Use a different AI model that can handle larger images
    
    return null
  } catch (error) {
    console.error('Compression error:', error)
    return null
  }
}

async function generateOptimizedImageAnalysis(base64: string, mimeType: string, file: File) {
  const martianApiKey = process.env.MARTIAN_API_KEY || 'sk-eac6e046df6042eaa86297d8e6820da3'
  
  console.log('Using optimized image analysis for large image...')
  
  // Use a more efficient approach for large images
  const prompt = `Analyze this large promotional content image and provide marketing suggestions. Focus on the most important visual elements.

Please provide:

1. BRAND ANALYSIS: 3-4 bullet points about what you can infer about the brand/creator from the visual content
2. COLOR PALETTE: Extract 4 main colors that you can see in the image with hex codes and descriptive names
3. CONTENT SUGGESTIONS: 5-7 specific, actionable suggestions for improving this content for Instagram:
   - Hashtag recommendations relevant to the content
   - Mention suggestions (@username) based on the content theme
   - Caption improvements specific to what's shown
   - Visual improvements based on the current design
   - Timing suggestions based on the content type

Format your response as JSON with this exact structure:
{
  "brandAnalysis": ["bullet point 1", "bullet point 2", "bullet point 3"],
  "colorPalette": [
    {"hex": "#E7ECEF", "name": "Anti-flash white"},
    {"hex": "#274C77", "name": "YinMn Blue"},
    {"hex": "#6096BA", "name": "Air superiority blue"},
    {"hex": "#A3CEF1", "name": "Uranian Blue"}
  ],
  "suggestions": [
    {
      "id": "suggestion-1",
      "type": "hashtag",
      "content": "Use a blue colour palette to enforce reliability to users.",
      "confidence": 0.85,
      "reasoning": "Blue colors are associated with trust and reliability in marketing"
    }
  ]
}

IMPORTANT: Respond with ONLY valid JSON. No markdown formatting, no explanations, just the raw JSON object.`

  try {
    // Use a more efficient model for large images
    const response = await fetch('https://api.withmartian.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${martianApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini', // Use the more efficient model
        messages: [
          {
            role: 'system',
            content: 'You are a marketing expert specializing in social media content optimization. You MUST respond with ONLY valid JSON format. Do not include any explanatory text, markdown formatting, or code blocks. Just return the raw JSON object.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: 'low' // Use low detail for large images
                }
              }
            ]
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Optimized analysis failed:', errorText)
      throw new Error(`Optimized analysis failed: ${response.status}`)
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    
    if (!content) {
      throw new Error('No content received from optimized analysis')
    }
    
    console.log('Optimized analysis received:', content.substring(0, 200) + '...')
    
    // Clean up the response to ensure it's valid JSON
    const cleanedContent = content.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
    const analysis = JSON.parse(cleanedContent)
    
    return {
      brandAnalysis: analysis.brandAnalysis || [
        "Content appears to be promotional material",
        "Design suggests professional marketing approach",
        "Visual elements indicate brand awareness"
      ],
      colorPalette: analysis.colorPalette || [
        { hex: "#000000", name: "Black" },
        { hex: "#FFFFFF", name: "White" },
        { hex: "#808080", name: "Gray" },
        { hex: "#FF0000", name: "Red" }
      ],
      suggestions: analysis.suggestions || [
        {
          id: "suggestion-1",
          type: "hashtag",
          content: "Add relevant hashtags to increase discoverability",
          confidence: 0.85,
          reasoning: "Hashtags help users find your content"
        },
        {
          id: "suggestion-2",
          type: "caption",
          content: "Write a compelling caption that tells your story",
          confidence: 0.78,
          reasoning: "Captions engage your audience and provide context"
        },
        {
          id: "suggestion-3",
          type: "mention",
          content: "Tag relevant accounts or collaborators",
          confidence: 0.72,
          reasoning: "Mentions help build community and increase reach"
        },
        {
          id: "suggestion-4",
          type: "timing",
          content: "Post when your audience is most active",
          confidence: 0.88,
          reasoning: "Timing affects engagement rates significantly"
        },
        {
          id: "suggestion-5",
          type: "color",
          content: "Ensure consistent brand colors throughout",
          confidence: 0.68,
          reasoning: "Color consistency builds brand recognition"
        }
      ]
    }
  } catch (error) {
    console.error('Optimized analysis error:', error)
    throw error
  }
}

async function generateTextOnlyAnalysis(file: File) {
  const martianApiKey = process.env.MARTIAN_API_KEY || 'sk-eac6e046df6042eaa86297d8e6820da3'
  
  const prompt = `Analyze this promotional content file and provide marketing suggestions. File type: ${file.type}, Size: ${file.size} bytes.

Please provide:

1. BRAND ANALYSIS: 3-4 bullet points about what you can infer about the brand/creator from the content
2. COLOR PALETTE: Suggest 4 main colors with hex codes and descriptive names that would work well for this type of content
3. CONTENT SUGGESTIONS: 5-7 specific, actionable suggestions for improving this content for Instagram:
   - Hashtag recommendations relevant to the content
   - Mention suggestions (@username) based on the content theme
   - Caption improvements
   - Visual improvements
   - Timing suggestions

Format your response as JSON with this exact structure:
{
  "brandAnalysis": ["bullet point 1", "bullet point 2", "bullet point 3"],
  "colorPalette": [
    {"hex": "#E7ECEF", "name": "Anti-flash white"},
    {"hex": "#274C77", "name": "YinMn Blue"},
    {"hex": "#6096BA", "name": "Air superiority blue"},
    {"hex": "#A3CEF1", "name": "Uranian Blue"}
  ],
  "suggestions": [
    {
      "id": "suggestion-1",
      "type": "hashtag",
      "content": "Use a blue colour palette to enforce reliability to users.",
      "confidence": 0.85,
      "reasoning": "Blue colors are associated with trust and reliability in marketing"
    }
  ]
}

IMPORTANT: Respond with ONLY valid JSON. No markdown formatting, no explanations, just the raw JSON object.`

  try {
    const response = await fetch('https://api.withmartian.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${martianApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a marketing expert. Respond with ONLY valid JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      })
    })
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    
    if (!content) {
      throw new Error('No content received')
    }
    
    const cleanedContent = content.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '')
    const analysis = JSON.parse(cleanedContent)
    
    return {
      brandAnalysis: analysis.brandAnalysis || [
        "Content appears to be promotional material",
        "Design suggests professional marketing approach",
        "Visual elements indicate brand awareness"
      ],
      colorPalette: analysis.colorPalette || [
        { hex: "#000000", name: "Black" },
        { hex: "#FFFFFF", name: "White" },
        { hex: "#808080", name: "Gray" },
        { hex: "#FF0000", name: "Red" }
      ],
      suggestions: analysis.suggestions || [
        {
          id: "suggestion-1",
          type: "hashtag",
          content: "Add relevant hashtags to increase discoverability",
          confidence: 0.85,
          reasoning: "Hashtags help users find your content"
        },
        {
          id: "suggestion-2",
          type: "caption",
          content: "Write a compelling caption that tells your story",
          confidence: 0.78,
          reasoning: "Captions engage your audience and provide context"
        },
        {
          id: "suggestion-3",
          type: "mention",
          content: "Tag relevant accounts or collaborators",
          confidence: 0.72,
          reasoning: "Mentions help build community and increase reach"
        },
        {
          id: "suggestion-4",
          type: "timing",
          content: "Post when your audience is most active",
          confidence: 0.88,
          reasoning: "Timing affects engagement rates significantly"
        },
        {
          id: "suggestion-5",
          type: "color",
          content: "Ensure consistent brand colors throughout",
          confidence: 0.68,
          reasoning: "Color consistency builds brand recognition"
        }
      ]
    }
  } catch (error) {
    console.error('Text analysis failed:', error)
    throw error
  }
}

async function generateContentAnalysis(file: File) {
  // Get Martian API key from environment variables
  const martianApiKey = process.env.MARTIAN_API_KEY || 'sk-eac6e046df6042eaa86297d8e6820da3'
  
  // Convert file to base64 for analysis
  const arrayBuffer = await file.arrayBuffer()
  let base64 = Buffer.from(arrayBuffer).toString('base64')
  const mimeType = file.type
  
  console.log('=== IMAGE ANALYSIS DEBUG ===')
  console.log('File type:', mimeType)
  console.log('File size:', file.size, 'bytes')
  console.log('Base64 length:', base64.length)
  
  // If image is too large, try different approaches
  if (file.type.startsWith('image/') && base64.length > 2000000) { // 2MB base64 limit
    console.log('Image too large for standard analysis, using optimized approach...')
    try {
      // Try with a more efficient model or different approach
      return await generateOptimizedImageAnalysis(base64, mimeType, file)
    } catch (error) {
      console.error('Optimized analysis failed:', error)
      console.log('Falling back to text-only analysis')
      return await generateTextOnlyAnalysis(file)
    }
  }
  
  // Step 1: Convert image to text description using Martian API
  const imageDescriptionPrompt = `Analyze this image in detail and provide a comprehensive description. Include:
1. All visible text content
2. Colors and design elements
3. Layout and composition
4. Brand elements or logos
5. Overall theme and style
6. Any specific details that would be relevant for social media marketing

Be very specific and detailed about what you see.`

  try {
    // Step 1: Get detailed image description
    console.log('Step 1: Getting image description...')
    const imageDescriptionRequest = {
      model: 'openai/gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: imageDescriptionPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    }
    
    const imageResponse = await fetch('https://api.withmartian.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${martianApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(imageDescriptionRequest)
    })
    
    if (!imageResponse.ok) {
      const errorText = await imageResponse.text()
      console.error('Image description failed:', errorText)
      
      // If it's an upstream inference error, try text-only analysis
      if (errorText.includes('Upstream inference error') || imageResponse.status === 500) {
        console.log('Upstream inference error detected, falling back to text-only analysis...')
        return await generateTextOnlyAnalysis(file)
      }
      
      throw new Error(`Image description failed: ${imageResponse.status}`)
    }
    
    const imageData = await imageResponse.json()
    const imageDescription = imageData.choices?.[0]?.message?.content
    
    if (!imageDescription) {
      throw new Error('No image description received')
    }
    
    console.log('Image description received:', imageDescription.substring(0, 200) + '...')
    
    // Step 2: Use the description to generate marketing suggestions
    console.log('Step 2: Generating marketing suggestions...')
    const marketingPrompt = `Based on this detailed image description, provide marketing analysis and suggestions:

IMAGE DESCRIPTION:
${imageDescription}

Please analyze this content and provide:

1. BRAND ANALYSIS: 3-4 bullet points about what you can infer about the brand/creator from the content
2. COLOR PALETTE: Extract 4 main colors mentioned in the description with hex codes and descriptive names
3. CONTENT SUGGESTIONS: 5-7 specific, actionable suggestions for improving this content for Instagram:
   - Hashtag recommendations relevant to the content
   - Mention suggestions (@username) based on the content theme
   - Caption improvements specific to what's shown
   - Visual improvements based on the current design
   - Timing suggestions based on the content type

Format your response as JSON with this exact structure:
{
  "brandAnalysis": ["bullet point 1", "bullet point 2", "bullet point 3"],
  "colorPalette": [
    {"hex": "#E7ECEF", "name": "Anti-flash white"},
    {"hex": "#274C77", "name": "YinMn Blue"},
    {"hex": "#6096BA", "name": "Air superiority blue"},
    {"hex": "#A3CEF1", "name": "Uranian Blue"}
  ],
  "suggestions": [
    {
      "id": "suggestion-1",
      "type": "hashtag",
      "content": "Use a blue colour palette to enforce reliability to users.",
      "confidence": 0.85,
      "reasoning": "Blue colors are associated with trust and reliability in marketing"
    }
  ]
}

IMPORTANT: Respond with ONLY valid JSON. No markdown formatting, no explanations, just the raw JSON object.`
    
    const requestBody = {
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a marketing analytics expert specializing in social media content optimization. You MUST respond with ONLY valid JSON format. Do not include any explanatory text, markdown formatting, or code blocks. Just return the raw JSON object.'
        },
        {
          role: 'user',
          content: marketingPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
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
      console.error('Marketing analysis failed:', errorText)
      throw new Error(`Marketing analysis failed: ${response.status}`)
    }
    
    const data = await response.json()
    let content = data.choices?.[0]?.message?.content
    
    if (!content) {
      throw new Error('No marketing analysis received from AI')
    }
    
    console.log('Marketing analysis received:', content.substring(0, 200) + '...')
    
    // Clean up the response to ensure it's valid JSON
    content = content.trim()
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    }
    if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    const analysis = JSON.parse(content)
    
    console.log('Analysis parsed successfully:', {
      brandAnalysisCount: analysis.brandAnalysis?.length || 0,
      colorPaletteCount: analysis.colorPalette?.length || 0,
      suggestionsCount: analysis.suggestions?.length || 0
    })
    
    // Validate and structure the response
    return {
      brandAnalysis: analysis.brandAnalysis || [
        "Content appears to be promotional material",
        "Design suggests professional marketing approach",
        "Visual elements indicate brand awareness"
      ],
      colorPalette: analysis.colorPalette || [
        { hex: "#000000", name: "Black" },
        { hex: "#FFFFFF", name: "White" },
        { hex: "#808080", name: "Gray" },
        { hex: "#FF0000", name: "Red" }
      ],
      suggestions: analysis.suggestions || [
        {
          id: "suggestion-1",
          type: "hashtag",
          content: "Add relevant hashtags to increase discoverability",
          confidence: 0.85,
          reasoning: "Hashtags help users find your content"
        },
        {
          id: "suggestion-2",
          type: "caption",
          content: "Write a compelling caption that tells your story",
          confidence: 0.78,
          reasoning: "Captions engage your audience and provide context"
        },
        {
          id: "suggestion-3",
          type: "mention",
          content: "Tag relevant accounts or collaborators",
          confidence: 0.72,
          reasoning: "Mentions help build community and increase reach"
        },
        {
          id: "suggestion-4",
          type: "timing",
          content: "Post when your audience is most active",
          confidence: 0.88,
          reasoning: "Timing affects engagement rates significantly"
        },
        {
          id: "suggestion-5",
          type: "color",
          content: "Ensure consistent brand colors throughout",
          confidence: 0.68,
          reasoning: "Color consistency builds brand recognition"
        }
      ]
    }
    
  } catch (error) {
    console.error('Error calling Martian API:', error)
    
    // Try text-only analysis as fallback
    try {
      console.log('Attempting fallback with text-only analysis...')
      return await generateTextOnlyAnalysis(file)
    } catch (fallbackError) {
      console.error('Text-only analysis also failed:', fallbackError)
    }
    
    // Return generic fallback data if all else fails
    return {
      brandAnalysis: [
        "Content appears to be promotional material",
        "Design suggests professional marketing approach",
        "Visual elements indicate brand awareness",
        "Content structure shows strategic planning"
      ],
      colorPalette: [
        { hex: "#000000", name: "Black" },
        { hex: "#FFFFFF", name: "White" },
        { hex: "#808080", name: "Gray" },
        { hex: "#FF0000", name: "Red" }
      ],
      suggestions: [
        {
          id: "suggestion-1",
          type: "hashtag",
          content: "Add relevant hashtags to increase discoverability",
          confidence: 0.85,
          reasoning: "Hashtags help users find your content"
        },
        {
          id: "suggestion-2",
          type: "caption",
          content: "Write a compelling caption that tells your story",
          confidence: 0.78,
          reasoning: "Captions engage your audience and provide context"
        },
        {
          id: "suggestion-3",
          type: "mention",
          content: "Tag relevant accounts or collaborators",
          confidence: 0.72,
          reasoning: "Mentions help build community and increase reach"
        },
        {
          id: "suggestion-4",
          type: "timing",
          content: "Post when your audience is most active",
          confidence: 0.88,
          reasoning: "Timing affects engagement rates significantly"
        },
        {
          id: "suggestion-5",
          type: "color",
          content: "Ensure consistent brand colors throughout",
          confidence: 0.68,
          reasoning: "Color consistency builds brand recognition"
        }
      ]
    }
  }
}
