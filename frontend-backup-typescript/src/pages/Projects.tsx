import React from 'react';
import { Box, Typography } from '@mui/material';

const Projects: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        프로젝트
      </Typography>
      <Typography variant="body1">
        프로젝트 페이지입니다.
      </Typography>
    </Box>
  );
};

export default Projects;