import React, { useState } from 'react'
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Grid, 
  Card, 
  CardContent,
  Chip,
  Pagination,
  CircularProgress,
  Alert,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material'
import { Search, Home, AttachMoney, Business, LocationOn } from '@mui/icons-material'
import { useListings } from '../utils/api'

const ListingList = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [dealType, setDealType] = useState('')
  const [region, setRegion] = useState('')
  const limit = 12

  const { data: listings, isLoading, error } = useListings({
    limit,
    offset: (page - 1) * limit,
    complex_name: searchTerm,
    deal_type: dealType,
    region
  })

  const handleSearch = (event) => {
    setSearchTerm(event.target.value)
    setPage(1)
  }

  const handlePageChange = (event, value) => {
    setPage(value)
  }

  const getDealTypeColor = (type) => {
    switch (type) {
      case '매매': return 'primary'
      case '전세': return 'secondary'
      case '월세': return 'success'
      default: return 'default'
    }
  }

  const getDealTypeIcon = (type) => {
    switch (type) {
      case '매매': return <Home />
      case '전세': return <Business />
      case '월세': return <AttachMoney />
      default: return <Home />
    }
  }

  const formatPrice = (price, priceAmount) => {
    if (priceAmount) {
      if (priceAmount >= 10000) {
        return `${(priceAmount / 10000).toFixed(1)}억`
      } else {
        return `${priceAmount}만원`
      }
    }
    return price || '가격 정보 없음'
  }

  const totalPages = listings?.pagination ? 
    Math.ceil(listings.pagination.total / limit) : 0

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* 헤더 */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          🏠 매물 목록
        </Typography>
        <Typography variant="body1" color="text.secondary">
          현재 등록된 매물 정보를 확인하세요
        </Typography>
      </Box>

      {/* 검색 및 필터 */}
      <Box sx={{ mb: 4 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="단지명으로 검색..."
              value={searchTerm}
              onChange={handleSearch}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>거래 유형</InputLabel>
              <Select
                value={dealType}
                onChange={(e) => {
                  setDealType(e.target.value)
                  setPage(1)
                }}
                label="거래 유형"
              >
                <MenuItem value="">전체</MenuItem>
                <MenuItem value="매매">매매</MenuItem>
                <MenuItem value="전세">전세</MenuItem>
                <MenuItem value="월세">월세</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              placeholder="지역 필터"
              value={region}
              onChange={(e) => {
                setRegion(e.target.value)
                setPage(1)
              }}
            />
          </Grid>
          
          <Grid item xs={12} md={2}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                setSearchTerm('')
                setDealType('')
                setRegion('')
                setPage(1)
              }}
            >
              초기화
            </Button>
          </Grid>
        </Grid>
      </Box>

      {/* 로딩 상태 */}
      {isLoading && (
        <Box display="flex" justifyContent="center" py={4}>
          <CircularProgress />
        </Box>
      )}

      {/* 에러 상태 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          매물 목록을 불러올 수 없습니다.
        </Alert>
      )}

      {/* 매물 카드 리스트 */}
      {listings?.data && (
        <>
          <Grid container spacing={3}>
            {listings.data.map((listing) => (
              <Grid item xs={12} sm={6} md={4} key={listing.id}>
                <Card 
                  sx={{ 
                    height: '100%',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: 4
                    }
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Typography variant="h6" component="h2" gutterBottom>
                        {listing.complex_name || `단지 ${listing.complex_id}`}
                      </Typography>
                      {getDealTypeIcon(listing.deal_type)}
                    </Box>
                    
                    <Box sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                        <LocationOn fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {listing.description ? 
                            listing.description.split(' ')[0] || '지역 정보 없음' : 
                            '지역 정보 없음'
                          }
                        </Typography>
                      </Box>
                      
                      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                        <Chip
                          icon={getDealTypeIcon(listing.deal_type)}
                          label={listing.deal_type || '매매'}
                          size="small"
                          color={getDealTypeColor(listing.deal_type)}
                        />
                        {listing.floor_info && (
                          <Chip
                            label={listing.floor_info}
                            size="small"
                            variant="outlined"
                          />
                        )}
                      </Box>
                      
                      <Typography variant="h6" color="primary.main" fontWeight="bold">
                        {formatPrice(listing.price_text, listing.price_amount)}
                      </Typography>
                      
                      {listing.area_sqm && (
                        <Typography variant="body2" color="text.secondary">
                          📐 {listing.area_sqm}㎡ ({listing.area_pyeong?.toFixed(1)}평)
                        </Typography>
                      )}
                      
                      {listing.direction && (
                        <Typography variant="body2" color="text.secondary">
                          🧭 {listing.direction}
                        </Typography>
                      )}
                    </Box>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        {listing.crawled_at ? 
                          new Date(listing.crawled_at).toLocaleDateString() : 
                          '등록일 정보 없음'
                        }
                      </Typography>
                      <Button 
                        size="small" 
                        variant="outlined"
                        onClick={() => {
                          // 상세 보기 로직
                          console.log('View details for:', listing.id)
                        }}
                      >
                        상세 보기
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={handlePageChange}
                color="primary"
                size="large"
              />
            </Box>
          )}

          {/* 결과 요약 */}
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              총 {listings.pagination?.total || 0}개 매물 중 {listings.data.length}개 표시
            </Typography>
          </Box>
        </>
      )}

      {/* 데이터 없음 */}
      {listings?.data?.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Home sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            검색 결과가 없습니다
          </Typography>
          <Typography variant="body2" color="text.secondary">
            다른 검색 조건을 시도해보세요
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export default ListingList