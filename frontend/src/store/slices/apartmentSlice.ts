// 아파트 데이터 관리 Slice

import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { ApartmentComplex } from '../../types/apartment';
import { getApartments, getApartmentsByBounds, SupabaseApartment } from '../../services/supabase';

interface ApartmentState {
  apartments: ApartmentComplex[];
  selectedApartment: ApartmentComplex | null;
  isLoading: boolean;
  error: string | null;
  filters: {
    priceRange: [number, number];
    areaRange: [number, number];
    constructionYearRange: [number, number];
    dealTypes: string[];
    searchRadius: number;
  };
}

const initialState: ApartmentState = {
  apartments: [],
  selectedApartment: null,
  isLoading: false,
  error: null,
  filters: {
    priceRange: [0, 1000000], // 만원 단위
    areaRange: [0, 300], // ㎡ 단위
    constructionYearRange: [1970, new Date().getFullYear()],
    dealTypes: ['매매', '전세', '월세'],
    searchRadius: 5 // km
  }
};

const apartmentSlice = createSlice({
  name: 'apartment',
  initialState,
  reducers: {
    setApartments: (state, action: PayloadAction<ApartmentComplex[]>) => {
      state.apartments = action.payload;
      state.isLoading = false;
      state.error = null;
    },

    addApartments: (state, action: PayloadAction<ApartmentComplex[]>) => {
      state.apartments.push(...action.payload);
    },

    updateApartment: (state, action: PayloadAction<ApartmentComplex>) => {
      const index = state.apartments.findIndex(apt => apt.id === action.payload.id);
      if (index !== -1) {
        state.apartments[index] = action.payload;
      }
    },

    setSelectedApartment: (state, action: PayloadAction<ApartmentComplex | null>) => {
      state.selectedApartment = action.payload;
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },

    updateFilters: (state, action: PayloadAction<Partial<ApartmentState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },

    clearApartments: (state) => {
      state.apartments = [];
      state.selectedApartment = null;
    },

    resetFilters: (state) => {
      state.filters = initialState.filters;
    }
  },
  extraReducers: (builder) => {
    builder
      // fetchApartmentsFromDB
      .addCase(fetchApartmentsFromDB.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchApartmentsFromDB.fulfilled, (state, action) => {
        state.isLoading = false;
        state.apartments = action.payload;
        state.error = null;
      })
      .addCase(fetchApartmentsFromDB.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'DB 데이터 로드 실패';
      })
      // fetchApartmentsByBounds
      .addCase(fetchApartmentsByBounds.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchApartmentsByBounds.fulfilled, (state, action) => {
        state.isLoading = false;
        state.apartments = action.payload;
        state.error = null;
      })
      .addCase(fetchApartmentsByBounds.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || '지도 범위 데이터 로드 실패';
      });
  }
});

export const {
  setApartments,
  addApartments,
  updateApartment,
  setSelectedApartment,
  setLoading,
  setError,
  updateFilters,
  clearApartments,
  resetFilters
} = apartmentSlice.actions;

// Supabase 데이터를 ApartmentComplex 형태로 변환
const convertSupabaseToApartmentComplex = (supabaseData: SupabaseApartment): ApartmentComplex => {
  return {
    id: supabaseData.id,
    name: supabaseData.complex_name,
    address: {
      road: supabaseData.address_road || '',
      jibun: supabaseData.address_jibun || '',
      dong: supabaseData.dong || '',
      gu: supabaseData.gu || '',
      city: supabaseData.city || '',
    },
    coordinates: {
      lat: supabaseData.latitude || 0,
      lng: supabaseData.longitude || 0,
    },
    details: {
      totalUnits: supabaseData.total_units || 0,
      constructionYear: supabaseData.construction_year || 0,
      floors: supabaseData.floors || 0,
      parkingRatio: supabaseData.parking_ratio || 0,
    },
    marketData: {
      lastTransactionPrice: supabaseData.last_transaction_price,
      lastTransactionDate: supabaseData.last_transaction_date ? new Date(supabaseData.last_transaction_date) : undefined,
      currentAskingPrice: supabaseData.current_asking_price,
      pricePerPyeong: supabaseData.price_per_pyeong,
    },
    lastUpdated: new Date(supabaseData.updated_at || supabaseData.created_at || Date.now()),
  };
};

// 비동기 액션: Supabase에서 아파트 데이터 가져오기
export const fetchApartmentsFromDB = createAsyncThunk(
  'apartment/fetchFromDB',
  async (limit: number = 100) => {
    const supabaseData = await getApartments(limit);
    return supabaseData.map(convertSupabaseToApartmentComplex);
  }
);

// 비동기 액션: 지도 범위 기반으로 아파트 데이터 가져오기
export const fetchApartmentsByBounds = createAsyncThunk(
  'apartment/fetchByBounds',
  async (bounds: {
    northEast: { lat: number; lng: number };
    southWest: { lat: number; lng: number };
  }) => {
    const supabaseData = await getApartmentsByBounds(bounds.northEast, bounds.southWest);
    return supabaseData.map(convertSupabaseToApartmentComplex);
  }
);

export default apartmentSlice.reducer;