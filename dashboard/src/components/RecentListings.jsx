import React from 'react'
import { 
  Box, 
  Typography, 
  List, 
  ListItem, 
  ListItemText, 
  Chip, 
  Avatar,
  CircularProgress,
  Alert
} from '@mui/material'
import { Home, AttachMoney, Business } from '@mui/icons-material'
import { useListings } from '../utils/api'

const RecentListings = () => {
  const { data: listings, isLoading, error } = useListings({ limit: 10 })

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error">
        매물 데이터를 불러올 수 없습니다.
      </Alert>
    )
  }

  if (!listings?.data?.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          표시할 매물이 없습니다.
        </Typography>
      </Box>
    )
  }

  const getDealTypeColor = (dealType) => {
    switch (dealType) {
      case '매매': return 'primary'
      case '전세': return 'secondary'
      case '월세': return 'success'
      default: return 'default'
    }
  }

  const getDealTypeIcon = (dealType) => {
    switch (dealType) {
      case '매매': return <Home />
      case '전세': return <Business />
      case '월세': return <AttachMoney />
      default: return <Home />
    }
  }

  return (
    <Box>
      <List sx={{ width: '100%' }}>
        {listings.data.slice(0, 8).map((listing, index) => (
          <ListItem 
            key={listing.id || index}
            sx={{ 
              px: 0, 
              py: 1,
              borderBottom: index < 7 ? '1px solid #f0f0f0' : 'none'
            }}
          >
            <Avatar 
              sx={{ 
                mr: 2, 
                bgcolor: 'primary.main',
                width: 40,
                height: 40
              }}
            >
              {getDealTypeIcon(listing.deal_type)}
            </Avatar>
            
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight="bold">
                    {listing.complex_name || `단지 ${listing.complex_id}`}
                  </Typography>
                  <Chip
                    label={listing.deal_type || '매매'}
                    size="small"
                    color={getDealTypeColor(listing.deal_type)}
                    variant="outlined"
                  />
                </Box>
              }
              secondary={
                <>
                  <span style={{ color: '#666' }}>
                    📍 {listing.region || '서울시'}
                  </span>
                  <br />
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontWeight: 'bold', color: '#1976d2' }}>
                      {listing.price || listing.price_numeric ? 
                        `${listing.price || (listing.price_numeric / 10000).toFixed(1)}억` : 
                        '가격 정보 없음'
                      }
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#999' }}>
                      {listing.created_at ? 
                        new Date(listing.created_at).toLocaleDateString() : 
                        '날짜 정보 없음'
                      }
                    </span>
                  </span>
                </>
              }
            />
          </ListItem>
        ))}
      </List>
      
      {listings.data.length > 8 && (
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Typography variant="body2" color="primary.main" sx={{ cursor: 'pointer' }}>
            더 많은 매물 보기 →
          </Typography>
        </Box>
      )}
    </Box>
  )
}

export default RecentListings