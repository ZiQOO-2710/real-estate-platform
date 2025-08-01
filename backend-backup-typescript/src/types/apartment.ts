export interface ApartmentComplex {
  id: number;
  complex_id: string;
  complex_name: string;
  address_road: string;
  city: string;
  gu: string;
  latitude: number;
  longitude: number;
  total_units: number;
  construction_year: number;
  last_transaction_price: number;
  source_url: string;
  created_at: string;
  updated_at: string;
}

export interface ApartmentSearchParams {
  city?: string | undefined;
  gu?: string | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  minYear?: number | undefined;
  maxYear?: number | undefined;
  minUnits?: number | undefined;
  maxUnits?: number | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  sortBy?: 'price' | 'year' | 'units' | 'name' | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}

export interface ApartmentSearchResult {
  data: ApartmentComplex[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface RegionStats {
  city: string;
  gu: string;
  totalApartments: number;
  averagePrice: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
  averageYear: number;
  totalUnits: number;
  priceRange: {
    under10: number;
    between10and20: number;
    over20: number;
  };
}

export interface RedevelopmentCandidate {
  id: number;
  complex_name: string;
  city: string;
  gu: string;
  address_road: string;
  construction_year: number;
  age: number;
  last_transaction_price: number;
  total_units: number;
  latitude: number;
  longitude: number;
  redevelopment_score: number;
  potential_profit: number;
  reasons: string[];
}