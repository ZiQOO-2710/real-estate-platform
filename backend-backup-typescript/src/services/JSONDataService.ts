import * as fs from 'fs';
import * as path from 'path';

interface ComplexData {
  id: number;
  complex_id: string;
  complex_name: string;
  city: string;
  gu: string;
  dong: string;
  address_road: string;
  address_jibun: string;
  latitude: number;
  longitude: number;
  total_units: number;
  construction_year: number;
  deal_min_price: number;
  deal_max_price: number;
  deal_count: number;
  lease_min_price: number;
  lease_max_price: number;
  lease_count: number;
  rent_min_price: number;
  rent_max_price: number;
  rent_min_deposit: number;
  rent_max_deposit: number;
  rent_count: number;
  min_area: number;
  max_area: number;
  representative_area: number;
  real_estate_type: string;
  trade_types: string;
  source_url: string;
  created_at: string;
  updated_at: string;
  raw_data: string;
}

interface SearchBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface SearchResult {
  complex_id: string;
  complex_name: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  distance_km?: number;
  construction_year?: number;
  max_area?: number;
  deal_max_price?: number;
  lease_max_price?: number;
}

export class JSONDataService {
  private naverData: ComplexData[] = [];
  private molitData: any[] = [];

  constructor() {
    this.loadNaverData();
    this.loadMolitData();
  }

  private loadNaverData(): void {
    try {
      // 46,807개 통합 단지 데이터로 변경
      const filePath = path.join(process.cwd(), 'supabase_full_complexes.json');
      if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const jsonData = JSON.parse(rawData);
        
        // 새로운 데이터 구조에 맞게 변환
        const complexes = jsonData.complexes || [];
        this.naverData = complexes.map((complex: any) => {
          // location 파싱 (문자열 형태: "경기 창원시 중앙동")
          const locationParts = (complex.location || '').split(' ');
          const city = locationParts[0] || '';
          const gu = locationParts[1] || '';
          const dong = locationParts[2] || '';
          
          return {
            id: complex.complex_id || Math.random(),
            complex_id: complex.complex_id || '',
            complex_name: complex.name || '',
            city: city,
            gu: gu,
            dong: dong,
            address_road: complex.location || '',
            address_jibun: complex.location || '',
            latitude: complex.coordinates?.latitude || 0,
            longitude: complex.coordinates?.longitude || 0,
            total_units: complex.building_info?.total_units || 0,
            construction_year: complex.building_info?.construction_year || 0,
            deal_min_price: complex.transaction_summary?.price_statistics?.deal_min || 0,
            deal_max_price: complex.transaction_summary?.price_statistics?.deal_max || 0,
            deal_count: complex.transaction_summary?.total_transactions || 0,
            lease_min_price: complex.transaction_summary?.price_statistics?.lease_min || 0,
            lease_max_price: complex.transaction_summary?.price_statistics?.lease_max || 0,
            lease_count: 0,
            rent_min_price: complex.transaction_summary?.price_statistics?.rent_min || 0,
            rent_max_price: complex.transaction_summary?.price_statistics?.rent_max || 0,
            rent_min_deposit: 0,
            rent_max_deposit: 0,
            rent_count: 0,
            min_area: complex.transaction_summary?.area_statistics?.min_area || 0,
            max_area: complex.transaction_summary?.area_statistics?.max_area || 0,
            representative_area: complex.transaction_summary?.area_statistics?.avg_area || 0,
            real_estate_type: 'apartment',
            trade_types: '매매,전세,월세',
            source_url: complex.data_sources?.[0]?.source || '',
            created_at: complex.integration_timestamp || '',
            updated_at: complex.integration_timestamp || '',
            raw_data: JSON.stringify(complex)
          };
        });
        
        console.log(`✅ 통합 단지 데이터 로드 완료: ${this.naverData.length}개`);
      } else {
        // 백업으로 기존 네이버 데이터 사용
        const naverFilePath = path.join(process.cwd(), 'naver_complexes_full.json');
        if (fs.existsSync(naverFilePath)) {
          const rawData = fs.readFileSync(naverFilePath, 'utf-8');
          const jsonData = JSON.parse(rawData);
          this.naverData = jsonData.data || [];
          console.log(`⚠️ 통합 데이터 없음, 네이버 데이터 사용: ${this.naverData.length}개`);
        }
      }
    } catch (error) {
      console.error('단지 데이터 로드 오류:', error);
    }
  }

  private loadMolitData(): void {
    try {
      const filePath = path.join(process.cwd(), 'molit_transactions_sample.json');
      if (fs.existsSync(filePath)) {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const jsonData = JSON.parse(rawData);
        this.molitData = jsonData.data || [];
      }
    } catch (error) {
      console.error('MOLIT 데이터 로드 오류:', error);
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    try {
      const R = 6371; // 지구 반지름 (km)
      const dLat = this.toRadians(lat2 - lat1);
      const dLon = this.toRadians(lon2 - lon1);
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    } catch {
      return Infinity;
    }
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  public searchComplexesByBounds(bounds: SearchBounds, limit: number = 100): SearchResult[] {
    const results: SearchResult[] = [];

    for (const complex of this.naverData) {
      try {
        const lat = parseFloat(complex.latitude?.toString() || '0');
        const lng = parseFloat(complex.longitude?.toString() || '0');

        if (lat >= bounds.minLat && lat <= bounds.maxLat &&
            lng >= bounds.minLng && lng <= bounds.maxLng) {
          results.push({
            complex_id: complex.complex_id?.toString() || '',
            complex_name: complex.complex_name || '',
            city: complex.city || '',
            address: complex.address_road || complex.address_jibun || '',
            latitude: lat,
            longitude: lng,
            construction_year: complex.construction_year,
            max_area: complex.max_area,
            deal_max_price: complex.deal_max_price,
            lease_max_price: complex.lease_max_price
          });

          if (results.length >= limit) break;
        }
      } catch (error) {
        continue;
      }
    }

    return results;
  }

  public searchComplexesByRadius(centerLat: number, centerLng: number, radiusKm: number, limit: number = 100): SearchResult[] {
    const results: SearchResult[] = [];

    for (const complex of this.naverData) {
      try {
        const lat = parseFloat(complex.latitude?.toString() || '0');
        const lng = parseFloat(complex.longitude?.toString() || '0');
        const distance = this.calculateDistance(centerLat, centerLng, lat, lng);

        if (distance <= radiusKm) {
          results.push({
            complex_id: complex.complex_id?.toString() || '',
            complex_name: complex.complex_name || '',
            city: complex.city || '',
            address: complex.address_road || complex.address_jibun || '',
            latitude: lat,
            longitude: lng,
            distance_km: Math.round(distance * 100) / 100,
            construction_year: complex.construction_year,
            max_area: complex.max_area,
            deal_max_price: complex.deal_max_price
          });

          if (results.length >= limit) break;
        }
      } catch (error) {
        continue;
      }
    }

    return results.sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));
  }

  public getComplexById(complexId: string): ComplexData | null {
    return this.naverData.find(complex => 
      complex.complex_id?.toString() === complexId
    ) || null;
  }

  public getStatistics(): any {
    const cities = [...new Set(this.naverData.map(c => c.city).filter(Boolean))];
    const dealPrices = this.naverData
      .map(c => c.deal_max_price)
      .filter(price => price && price > 0);

    return {
      naver_complexes: this.naverData.length,
      molit_transactions: this.molitData.length,
      cities: cities,
      price_range: {
        min_deal_price: dealPrices.length > 0 ? Math.min(...dealPrices) : 0,
        max_deal_price: dealPrices.length > 0 ? Math.max(...dealPrices) : 0
      }
    };
  }
}

export const jsonDataService = new JSONDataService();