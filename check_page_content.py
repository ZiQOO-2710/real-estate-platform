
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        try:
            await page.goto("https://new.land.naver.com/complexes/2592", wait_until="domcontentloaded")
            await page.wait_for_timeout(5000)
            content = await page.content()
            print(content)
        except Exception as e:
            print(f"An error occurred: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
