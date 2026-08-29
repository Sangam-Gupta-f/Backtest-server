import Bottleneck from 'bottleneck';

export const historicalLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 350,
});
