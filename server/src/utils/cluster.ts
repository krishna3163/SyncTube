/**
 * Clustering must be an explicit opt-in. RoomManager and participant state are
 * process-local, so automatically forking workers in production can send room
 * creation, REST requests, and Socket.IO connections to different state stores.
 */
export function isClusterEnabled(clusterValue: string | undefined = process.env.CLUSTER): boolean {
  return clusterValue === '1' || clusterValue?.toLowerCase() === 'true';
}
