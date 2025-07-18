import asyncio
from playwright.async_api import async_playwright
import re

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        found = False

        async def handle_route(route):
            nonlocal found
            request = route.request
            if re.search(r'new\.land\.naver\.com/api/', request.url):
                print(f"Intercepted API request: {request.url}")
                headers = await request.all_headers()
                print("Request Headers:")
                for key, value in headers.items():
                    print(f"  {key}: {value}")
                found = True
            await route.continue_()

        await page.route("**/*", handle_route)

        try:
            await page.goto("https://new.land.naver.com/complexes/2592", wait_until="load")
            await page.wait_for_timeout(10000) # Wait for async calls
        except Exception as e:
            print(f"An error occurred: {e}")
        finally:
            if not found:
                print("No API requests to 'new.land.naver.com/api/' were intercepted.")
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())