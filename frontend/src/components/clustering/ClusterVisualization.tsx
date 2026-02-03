import React from 'react';
import { Card } from '../ui/Card';
import { Users, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface Cluster {
  id: string;
  name: string;
  description: string;
  studentCount: number;
  engagementLevel: 'high' | 'medium' | 'low';
  color: string;
  prediction?: 'improving' | 'declining' | 'stable';
}

interface ClusterVisualizationProps {
  clusters: Cluster[];
  showPredictions?: boolean;
}

export const ClusterVisualization: React.FC<ClusterVisualizationProps> = ({
  clusters,
  showPredictions = true
}) => {
  const getIcon = (level: string) => {
    switch (level) {
      case 'high':
        return <TrendingUp className="h-5 w-5" />;
      case 'low':
        return <TrendingDown className="h-5 w-5" />;
      default:
        return <Activity className="h-5 w-5" />;
    }
  };

  const getPredictionIcon = (prediction?: string) => {
    if (!prediction) return null;
    switch (prediction) {
      case 'improving':
        return <TrendingUp className="h-4 w-4 text-blue-600" />;
      case 'declining':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-yellow-600" />;
    }
  };

  const totalStudents = clusters.reduce((sum, cluster) => sum + cluster.studentCount, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {clusters.map((cluster) => (
          <Card key={cluster.id} className="border-l-4" style={{ borderLeftColor: cluster.color }}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: cluster.color }}
                  >
                    {getIcon(cluster.engagementLevel)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{cluster.name}</h3>
                    <p className="text-xs text-gray-500">{cluster.description}</p>
                  </div>
                </div>
                {showPredictions && cluster.prediction && (
                  <div className="flex items-center space-x-1">
                    {getPredictionIcon(cluster.prediction)}
                    <span className="text-xs text-gray-600 capitalize">
                      {cluster.prediction}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  <span className="text-2xl font-bold text-gray-900">
                    {cluster.studentCount}
                  </span>
                  <span className="text-sm text-gray-500">
                    ({((cluster.studentCount / totalStudents) * 100).toFixed(1)}%)
                  </span>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  cluster.engagementLevel === 'high' ? 'bg-blue-100 text-blue-800' :
                  cluster.engagementLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {cluster.engagementLevel.toUpperCase()}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${(cluster.studentCount / totalStudents) * 100}%`,
                      backgroundColor: cluster.color
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

