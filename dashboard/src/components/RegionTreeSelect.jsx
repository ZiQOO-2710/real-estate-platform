import React, { useState } from 'react';
import {
  Box,
  TextField,
  Autocomplete,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  InputAdornment,
  Divider
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
  LocationOn as LocationIcon,
  MyLocation as MyLocationIcon
} from '@mui/icons-material';
import { regionsData, getAllRegions, searchRegions } from '../data/regions';

const RegionTreeSelect = ({ 
  value = '', 
  onChange, 
  placeholder = "지역을 선택하세요",
  showSearch = true,
  maxHeight = 400 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProvinces, setExpandedProvinces] = useState(new Set(['서울특별시'])); // 서울은 기본으로 열어둠
  const [isOpen, setIsOpen] = useState(false);

  // 모든 지역을 플랫 배열로 변환 (검색용)
  const allRegions = getAllRegions();

  // 검색 결과
  const searchResults = searchTerm ? searchRegions(searchTerm) : [];

  // 아코디언 토글
  const handleAccordionToggle = (provinceName) => {
    const newExpanded = new Set(expandedProvinces);
    if (newExpanded.has(provinceName)) {
      newExpanded.delete(provinceName);
    } else {
      newExpanded.add(provinceName);
    }
    setExpandedProvinces(newExpanded);
  };

  // 지역 선택 핸들러
  const handleRegionSelect = (regionName, regionCoords = null) => {
    onChange(regionName, regionCoords);
    setIsOpen(false);
    setSearchTerm('');
  };

  // 검색어 변경
  const handleSearchChange = (event, newValue) => {
    setSearchTerm(newValue);
  };

  // 검색 결과에서 선택
  const handleSearchSelect = (event, selectedOption) => {
    if (selectedOption) {
      handleRegionSelect(selectedOption.name, selectedOption.coords);
    }
  };

  // 시/도별 타입에 따른 아이콘
  const getProvinceIcon = (type) => {
    switch (type) {
      case 'metropolitan': return '🏙️';
      case 'special': return '🏛️';
      case 'province': return '🌄';
      default: return '📍';
    }
  };

  // 시/군/구별 타입에 따른 아이콘
  const getCityIcon = (type) => {
    switch (type) {
      case 'district': return '🏢';
      case 'city': return '🏘️';
      case 'county': return '🌾';
      default: return '📍';
    }
  };

  return (
    <Box sx={{ position: 'relative' }}>
      {/* 검색 기능 */}
      {showSearch && (
        <Box sx={{ mb: 2 }}>
          <Autocomplete
            freeSolo
            options={searchResults}
            getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
            inputValue={searchTerm}
            onInputChange={handleSearchChange}
            onChange={handleSearchSelect}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="지역명을 검색하세요..."
                size="small"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <Typography variant="body2" sx={{ mr: 1 }}>
                    {getCityIcon(option.type)}
                  </Typography>
                  <Box>
                    <Typography variant="body2">
                      {option.name}
                    </Typography>
                    {option.parentName && (
                      <Typography variant="caption" color="text.secondary">
                        {option.parentName}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            )}
            noOptionsText="검색 결과가 없습니다"
            sx={{ mb: 1 }}
          />
        </Box>
      )}

      {/* 현재 선택된 지역 표시 */}
      {value && (
        <Box sx={{ mb: 2 }}>
          <Chip
            icon={<LocationIcon />}
            label={`선택된 지역: ${value}`}
            onDelete={() => handleRegionSelect('')}
            color="primary"
            variant="outlined"
          />
        </Box>
      )}

      {/* 트리 구조 지역 선택 */}
      <Paper 
        elevation={1} 
        sx={{ 
          maxHeight, 
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider'
        }}
      >
        {/* 전체 선택 옵션 */}
        <ListItem>
          <ListItemButton onClick={() => handleRegionSelect('')}>
            <ListItemText 
              primary={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <MyLocationIcon sx={{ mr: 1, fontSize: 20 }} />
                  <Typography variant="body2" fontWeight="medium">
                    전국 전체
                  </Typography>
                </Box>
              }
            />
          </ListItemButton>
        </ListItem>
        
        <Divider />

        {/* 시/도별 트리 */}
        {Object.entries(regionsData).map(([provinceKey, province]) => (
          <Accordion
            key={provinceKey}
            expanded={expandedProvinces.has(provinceKey)}
            onChange={() => handleAccordionToggle(provinceKey)}
            elevation={0}
            sx={{ 
              '&:before': { display: 'none' },
              '&.Mui-expanded': { margin: 0 }
            }}
          >
            <AccordionSummary 
              expandIcon={<ExpandMoreIcon />}
              sx={{ 
                minHeight: 48,
                '&.Mui-expanded': { minHeight: 48 }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <Typography variant="body2" sx={{ mr: 1 }}>
                  {getProvinceIcon(province.type)}
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {province.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', mr: 2 }}>
                  {Object.keys(province.children).length}개 지역
                </Typography>
              </Box>
            </AccordionSummary>
            
            <AccordionDetails sx={{ p: 0 }}>
              {/* 시/도 전체 선택 */}
              <ListItem sx={{ pl: 4 }}>
                <ListItemButton 
                  onClick={() => handleRegionSelect(province.name)}
                  sx={{ borderRadius: 1 }}
                >
                  <ListItemText 
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body2" sx={{ mr: 1 }}>
                          🌍
                        </Typography>
                        <Typography variant="body2" color="primary">
                          {province.name} 전체
                        </Typography>
                      </Box>
                    }
                  />
                </ListItemButton>
              </ListItem>
              
              <Divider sx={{ ml: 4, mr: 2 }} />
              
              {/* 시/군/구 목록 */}
              {Object.entries(province.children).map(([cityKey, city]) => (
                <ListItem key={cityKey} sx={{ pl: 4 }}>
                  <ListItemButton 
                    onClick={() => handleRegionSelect(city.name, city.coords)}
                    sx={{ borderRadius: 1 }}
                  >
                    <ListItemText 
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ mr: 1 }}>
                            {getCityIcon(city.type)}
                          </Typography>
                          <Typography variant="body2">
                            {city.name}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>
    </Box>
  );
};

export default RegionTreeSelect;