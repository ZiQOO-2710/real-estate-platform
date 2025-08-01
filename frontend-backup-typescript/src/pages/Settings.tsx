import React from 'react';
import { Box, Typography } from '@mui/material';

const Settings: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        설정
      </Typography>
      <Typography variant="body1">
        설정 페이지입니다.
      </Typography>
    </Box>
  );
};

export default Settings;