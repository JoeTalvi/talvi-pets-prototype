import { args, readInput, evaluate, output, findingText, zodText, fail } from './content/io';
import { coverage, coverageText } from './content/coverage';
async function main() {
    const a = args(process.argv.slice(2), true);
    if (a.help) {
        await output(a, 'report:coverage [--content dir|bundle.json] [--manifest file] [--pet id] [--project id] [--format text|json] [--out file] [--known-missing file]\n--panel/--reveal/--stars need the sim kernel (WORK-003)');
        return;
    }
    const { files, manifest, knownMissing } = await readInput(a), { content, report } = evaluate(files, manifest, a, knownMissing);
    if (!content) {
        await output(a, a.format === 'json' ? JSON.stringify(report, null, 2) : report.zodIssues.map(i => `${i.file}:${i.path} ${i.message}`).join('\n'));
        process.exitCode = 1;
        return;
    }
    const data = coverage(content, report.findings, a);
    await output(a, a.format === 'json' ? JSON.stringify(data, null, 2) : coverageText(content, data) + '\n' + [...report.zodIssues.map(zodText), ...report.findings.map(findingText)].join('\n'));
    process.exitCode = report.exitCode;
}
main().catch(fail);
