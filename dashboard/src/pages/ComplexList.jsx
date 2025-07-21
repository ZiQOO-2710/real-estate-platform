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
  InputAdornment
} from '@mui/material'
import { Search, Business, Home, CalendarToday } from '@mui/icons-material'
import { useComplexes } from '../utils/api'

const ComplexList = () => {
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [region, setRegion] = useState('')
  const limit = 12

  const { data: complexes, isLoading, error } = useComplexes({
    limit,
    offset: (page - 1) * limit,
    search: searchTerm,
    region
  })

  const handleSearch = (event) => {
    setSearchTerm(event.target.value)
    setPage(1)
  }

  const handlePageChange = (event, value) => {
    setPage(value)
  }

  const totalPages = complexes?.pagination ? 
    Math.ceil(complexes.pagination.total / limit) : 0

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* 헤더 */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          🏢 단지 목록
        </Typography>
        <Typography variant="body1" color="text.secondary">
          등록된 아파트 단지 정보를 확인하세요
        </Typography>
      </Box>

      {/* 검색 및 필터 */}
      <Box sx={{ mb: 4 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
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
          
          <Grid item xs={12} md={3}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() => {
                setSearchTerm('')
                setRegion('')
                setPage(1)
              }}
            >
              필터 초기화
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
          단지 목록을 불러올 수 없습니다.
        </Alert>
      )}

      {/* 단지 카드 리스트 */}
      {complexes?.data && (
        <>
          <Grid container spacing={3}>
            {complexes.data.map((complex) => (
              <Grid item xs={12} sm={6} md={4} key={complex.complex_id}>
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
                        {complex.complex_name || `단지 ${complex.complex_id}`}
                      </Typography>
                      <Business color="primary" />
                    </Box>
                    
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        📍 {complex.address || '주소 정보 없음'}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        <Chip
                          icon={<Business />}
                          label={`${complex.total_buildings || 0}동`}
                          size="small"
                          variant="outlined"
                          color="primary"
                        />
                        <Chip
                          icon={<Home />}
                          label={`${complex.total_households || 0}세대`}
                          size="small"
                          variant="outlined"
                          color="secondary"
                        />
                      </Box>
                      
                      {complex.completion_year && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <CalendarToday fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">
                            {complex.completion_year}년 준공
                          </Typography>
                        </Box>
                      )}
                    </Box>
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        ID: {complex.complex_id}
                      </Typography>
                      <Button 
                        size="small" 
                        variant="outlined"
                        onClick={() => {
                          // 상세 보기 로직
                          console.log('View details for:', complex.complex_id)
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
              총 {complexes.pagination?.total || 0}개 단지 중 {complexes.data.length}개 표시
            </Typography>
          </Box>
        </>
      )}

      {/* 데이터 없음 */}
      {complexes?.data?.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Business sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            검색 결과가 없습니다
          </Typography>
          <Typography variant="body2" color="text.secondary">
            다른 검색어를 시도해보세요
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export default ComplexList