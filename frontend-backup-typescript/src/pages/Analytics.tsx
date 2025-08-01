import React from 'react';
import { Box, Typography } from '@mui/material';

const Analytics: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        분석
      </Typography>
      <Typography variant="body1">
        분석 페이지입니다.
      </Typography>
    </Box>
  );
};

export default Analytics;