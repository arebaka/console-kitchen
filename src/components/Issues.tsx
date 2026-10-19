import React from 'react';

import { Fix, Issue, StepId } from '@/types';
import { Translation, format, stepName } from '@i18n';
import { Platform } from '@/platforms';

interface IssuesProps {
	issues: Issue[];
	platform: Platform; // its catalog names the components of fixes
	applyFix: (fix: Fix) => void;
	setStep?: (step: StepId) => void; // offers to open the step of every issue
	t: Translation;
}

export function Issues({
	issues,
	platform,
	applyFix,
	setStep,
	t
}: IssuesProps) {
	const notice = (issue: Issue, index: number) => (
		<li key={index} className={`notice ${issue.level}`}>
			<Notice
				issue={issue}
				platform={platform}
				applyFix={applyFix}
				setStep={setStep}
				t={t} />
		</li>
	);

	const warnings = issues.filter(issue => issue.level != 'info');
	const advices = issues.filter(issue => issue.level == 'info');

	return (<>
		{warnings.length > 0 && (
			<ul className="warnings">
				{warnings.map(notice)}
			</ul>
		)}
		{advices.length > 0 && (
			<ul className="advices">
				{advices.map(notice)}
			</ul>
		)}
	</>);
}

interface NoticeProps {
	issue: Issue;
	platform: Platform;
	applyFix: (fix: Fix) => void;
	setStep?: (step: StepId) => void;
	t: Translation;
}

// Text of an issue with a button for every fix, in the list of the step or in a toast
export function Notice({
	issue,
	platform,
	applyFix,
	setStep,
	t
}: NoticeProps) {
	// Names of the components a fix adds or removes
	const names = (ids: string[]) => ids.map(id => platform.catalog.components.find(comp => comp.id == id)?.name ?? id).join(', ');

	return (<>
		<span className="text">
			{format(t.issues[issue.code as keyof Translation['issues']], issue.params)}
		</span>
		{issue.fixes?.map((fix, index) => (
			<button
				key={index}
				className="fix"
				onClick={() =>{  applyFix(fix); }}>
				{fix.add
					? format(t.issues.add, { component: names(fix.add) })
					: format(t.issues.remove, { component: names(fix.remove ?? []) })}
			</button>
		))}
		{setStep && (
			<button
				className="fix"
				onClick={() =>{  setStep(issue.step); }}>
				{t.issues.go}: {stepName(t, platform.id, issue.step)}
			</button>
		)}
	</>);
}
