#!/usr/bin/env python3
"""
Working Ministry of Land Crawler - No Unicode Issues
"""

import requests
import time
import sqlite3
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

def main():
    print("=== Working Ministry of Land Crawler ===")
    print(f"Start time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Database setup
    db_path = "working_molit_data.db"
    
    # API configuration
    service_key = "UTbePYIP4ncyCPzhgiw146sprZ18xCv7Ca5xxNf0CNR1tM3Pl7Rldtr08mQQ1a4htR/PhCPWLdAbIdhgl7IDlQ=="
    base_url = "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
    
    # Major regions
    regions = {
        "Seoul Gangnam": "11680",
        "Seoul Seocho": "11650", 
        "Seoul Songpa": "11710",
        "Seoul Gangdong": "11740",
        "Seoul Mapo": "11560",
        "Busan Haeundae": "26350",
        "Busan Busanjin": "26290",
        "Daegu Suseong": "27200",
        "Incheon Yeonsu": "28185",
        "Gyeonggi Seongnam": "41131",
        "Gyeonggi Suwon": "41111",
        "Gyeonggi Goyang": "41281",
        "Gyeonggi Yongin": "41463",
        "Gyeonggi Hwaseong": "41590"
    }
    
    # Recent 3 months
    months = []
    current_date = datetime.now()
    for i in range(3):
        target_date = current_date - timedelta(days=i * 30)
        year_month = target_date.strftime("%Y%m")
        months.append(year_month)
    
    print(f"Regions: {len(regions)}")
    print(f"Months: {months}")
    
    # Database initialization
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY,
            region_name TEXT,
            region_code TEXT,
            apt_name TEXT,
            deal_amount TEXT,
            deal_date TEXT,
            area TEXT,
            floor TEXT,
            build_year TEXT,
            dong TEXT,
            jibun TEXT,
            created_at TEXT
        )
    ''')
    
    conn.commit()
    
    total_saved = 0
    
    for region_name, region_code in regions.items():
        print(f"\nProcessing {region_name}...")
        
        region_total = 0
        for year_month in months:
            params = {
                'serviceKey': service_key,
                'LAWD_CD': region_code,
                'DEAL_YMD': year_month,
                'pageNo': '1',
                'numOfRows': '999'
            }
            
            try:
                response = requests.get(base_url, params=params, timeout=30)
                
                if response.status_code == 200:
                    root = ET.fromstring(response.text)
                    result_code = root.find('.//resultCode')
                    
                    if result_code is not None and result_code.text == '000':
                        items = root.findall('.//item')
                        
                        for item in items:
                            try:
                                apt_name = item.find('aptNm').text if item.find('aptNm') is not None else ''
                                deal_amount = item.find('dealAmount').text.strip() if item.find('dealAmount') is not None else ''
                                deal_year = item.find('dealYear').text if item.find('dealYear') is not None else ''
                                deal_month = item.find('dealMonth').text.zfill(2) if item.find('dealMonth') is not None else ''
                                deal_day = item.find('dealDay').text.zfill(2) if item.find('dealDay') is not None else ''
                                area = item.find('excluUseAr').text if item.find('excluUseAr') is not None else ''
                                floor = item.find('floor').text if item.find('floor') is not None else ''
                                build_year = item.find('buildYear').text if item.find('buildYear') is not None else ''
                                dong = item.find('dong').text if item.find('dong') is not None else ''
                                jibun = item.find('jibun').text if item.find('jibun') is not None else ''
                                
                                if apt_name and deal_amount:
                                    deal_date = f"{deal_year}-{deal_month}-{deal_day}" if deal_year and deal_month and deal_day else ''
                                    
                                    cursor.execute('''
                                        INSERT INTO transactions 
                                        (region_name, region_code, apt_name, deal_amount, deal_date, area, floor, build_year, dong, jibun, created_at)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    ''', (
                                        region_name, region_code, apt_name, deal_amount, deal_date,
                                        area, floor, build_year, dong, jibun, datetime.now().isoformat()
                                    ))
                                    
                                    region_total += 1
                                    
                            except Exception as e:
                                print(f"Item processing error: {e}")
                                continue
                        
                        print(f"  {year_month}: {len(items)} collected")
                        
                    else:
                        print(f"  {year_month}: API error")
                        
                else:
                    print(f"  {year_month}: HTTP {response.status_code}")
                    
            except Exception as e:
                print(f"  {year_month}: Error - {e}")
                
            # API rate limit consideration
            time.sleep(3)
        
        total_saved += region_total
        print(f"  {region_name} total: {region_total} saved")
        
        # Intermediate save
        conn.commit()
        
        # Wait between regions
        time.sleep(2)
    
    # Final results
    cursor.execute("SELECT COUNT(*) FROM transactions")
    final_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT region_name) FROM transactions")
    region_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(DISTINCT apt_name) FROM transactions")
    apt_count = cursor.fetchone()[0]
    
    cursor.execute("SELECT region_name, COUNT(*) FROM transactions GROUP BY region_name ORDER BY COUNT(*) DESC")
    region_stats = cursor.fetchall()
    
    conn.close()
    
    print(f"\n=== Crawling Complete ===")
    print(f"End time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Total data collected: {final_count:,}")
    print(f"Regions covered: {region_count}")
    print(f"Unique apartments: {apt_count:,}")
    print(f"Database file: {db_path}")
    
    print(f"\nRegion statistics:")
    for region, count in region_stats:
        print(f"  {region}: {count:,}")
    
    print(f"\nSuccess! Ministry of Land data collection complete: {final_count:,} transactions")

if __name__ == "__main__":
    main()