import React from 'react';
import {type Summary} from '../page';
import { apiFetch } from '@/lib/fetcher';

interface SummaryProps {
  summary: Summary;
}

export const SummaryPage = ({summary}: SummaryProps) => {

  return (
    <div className="space-y-6">
      {summary.sections.map((section, index) => (
        <div key={section.id || index} className="summary-section">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                {index + 1}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-semibold mb-3 ${
                parseInt(section.level) === 1 ? 'text-2xl' :
                  parseInt(section.level) === 2 ? 'text-xl' : 'text-lg'
              }`}>
                {section.title}
              </h3>
              <div className="prose prose-lg max-w-none">
                <p className="whitespace-pre-wrap leading-relaxed">
                  {section.content}
                </p>
              </div>
              {section.subsections && section.subsections.length > 0 && (
                <div className="mt-4 pl-6 border-l-2 border-border/20">
                  {section.subsections.map((subsection, subIndex) => (
                    <div key={subsection.id || subIndex} className="mb-4">
                      <h4 className="font-medium text-lg mb-2">
                        {subsection.title}
                      </h4>
                      <div className="prose max-w-none">
                        <p className="whitespace-pre-wrap">
                          {subsection.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

