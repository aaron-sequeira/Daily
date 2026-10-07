import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { reportHtml, type ReportDoc } from './pdf';

export async function shareReportPdf(d: ReportDoc): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: reportHtml(d) });
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share your report', UTI: 'com.adobe.pdf' });
}
