/**
 * Cloudflare Worker - OpenAI API 프록시 서버
 * 
 * 이 파일을 Cloudflare Workers에 배포하여 사용합니다.
 * GitHub에는 올리지 않아도 됩니다. (참고용으로 보관)
 * 
 * 설정 방법:
 * 1. https://dash.cloudflare.com 접속 후 로그인
 * 2. Workers & Pages > Create Worker 클릭
 * 3. 이 코드를 붙여넣고 배포
 * 4. Settings > Variables에서 OPENAI_API_KEY 환경 변수 추가
 * 5. 생성된 Worker URL을 script.js의 PROXY_API_URL에 입력
 */

const ALLOWED_ORIGINS = [
    'https://your-github-username.github.io',
    'http://localhost',
    'http://127.0.0.1'
];

export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        
        const corsHeaders = {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        try {
            const requestBody = await request.json();
            
            const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: requestBody.model || 'gpt-3.5-turbo',
                    messages: requestBody.messages,
                    temperature: requestBody.temperature || 0.7,
                    max_tokens: requestBody.max_tokens || 500
                })
            });

            const responseData = await openaiResponse.json();

            return new Response(JSON.stringify(responseData), {
                status: openaiResponse.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: 'Internal server error' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};
