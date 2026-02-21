import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DownloadIcon, PrinterIcon, ShareIcon } from 'lucide-react';
export const ReportDetail = () => {
  const {
    reportId
  } = useParams();
  const {
    user
  } = useAuth();
  // Mock report data
  const report = {
    id: reportId,
    title: 'Course Progress Report',
    course: 'Machine Learning Fundamentals',
    date: '2023-10-10',
    type: 'progress',
    description: 'This report shows the progress of students in the Machine Learning Fundamentals course.',
    data: {
      completion: 65,
      attendance: 82,
      averageScore: 78,
      topPerformer: 'Alice Johnson',
      needsImprovement: 3,
      totalStudents: 45
    }
  };
  return <div>
      <div className="md:flex md:items-center md:justify-between mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 leading-7">
            {report.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {report.course} • Generated on {report.date}
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4 space-x-3">
          <button type="button" className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            <PrinterIcon className="-ml-1 mr-2 h-5 w-5 text-gray-500 dark:text-gray-400" />
            Print
          </button>
          <button type="button" className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            <DownloadIcon className="-ml-1 mr-2 h-5 w-5 text-gray-500 dark:text-gray-400" />
            Download
          </button>
          <button type="button" className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
            <ShareIcon className="-ml-1 mr-2 h-5 w-5" />
            Share
          </button>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100">
            Report Overview
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            {report.description}
          </p>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700">
          <dl>
            <div className="bg-gray-50 dark:bg-gray-700 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Course Completion Rate
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                <div className="flex items-center">
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                    <div className="bg-blue-500 h-2.5 rounded-full" style={{
                    width: `${report.data.completion}%`
                  }}></div>
                  </div>
                  <span className="ml-2">{report.data.completion}%</span>
                </div>
              </dd>
            </div>
            <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Average Attendance
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                <div className="flex items-center">
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                    <div className="bg-blue-600 h-2.5 rounded-full" style={{
                    width: `${report.data.attendance}%`
                  }}></div>
                  </div>
                  <span className="ml-2">{report.data.attendance}%</span>
                </div>
              </dd>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Average Score
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                {report.data.averageScore}/100
              </dd>
            </div>
            <div className="bg-white dark:bg-gray-800 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Top Performer
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                {report.data.topPerformer}
              </dd>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Students Needing Improvement
              </dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 sm:mt-0 sm:col-span-2">
                {report.data.needsImprovement} out of{' '}
                {report.data.totalStudents} students
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="mt-8">
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Detailed Analysis</h2>
        {/* Placeholder for charts and detailed data */}
        <div className="mt-4 bg-white dark:bg-gray-800 shadow sm:rounded-lg p-6">
          <div className="text-center py-10 text-gray-500 dark:text-gray-400">
            <p>Detailed charts and analysis would appear here.</p>
            <p className="mt-2 text-sm">
              This is a placeholder for visualization components.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <Link to={`/dashboard/${user?.role}/reports`} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">
          ← Back to Reports
        </Link>
      </div>
    </div>;
};
