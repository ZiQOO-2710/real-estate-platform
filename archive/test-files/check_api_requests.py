
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # 네트워크 요청을 감지할 리스트
        api_requests = []

        def handle_request(request):
            if "api" in request.url:
                print(f"Found API request: {request.url}")
                api_requests.append(request.url)

        page.on("request", handle_request)

        try:
            await page.goto("https://new.land.naver.com/complexes/2592", wait_until="networkidle")
        except Exception as e:
            print(f"Error navigating to page: {e}")

        await browser.close()

        if not api_requests:
            print("No matching API requests were found.")

if __name__ == "__main__":
    asyncio.run(main())
