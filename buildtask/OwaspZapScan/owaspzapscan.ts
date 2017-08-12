import { ZapActiveScanOptions } from './ZapClientOptions';

import task = require('vsts-task-lib');
import path = require('path');
import request = require('request');
import requestPromise = require('request-promise');
import sleep = require('thread-sleep');
import xmlParser = require('xmljson');
import fs = require('fs');

task.setResourcePath(path.join(__dirname, 'task.json'));

async function run() {
    // Get the required inputs
    let zapApiUrl: string = task.getInput('zapApiUrl', true);
    let zapApiKey: string = task.getInput('zapApiKey', true);
    let targetUrl: string = task.getInput('targetUrl', true);

    // Get the optional inputs
    let contextId: string = task.getInput('contextId');
    let recurse: boolean = task.getBoolInput('recurse');
    let inScopeOnly: boolean = task.getBoolInput('inScopeOnly');
    let scanPolicyName: string = task.getInput('scanPolicyName');
    let method: string = task.getInput('method');
    let postData: string = task.getInput('postData');

    let highAlertThreshold: number = parseInt(task.getInput('maxHighRiskAlerts'));
    let mediumAlertThreshold: number = parseInt(task.getInput('maxMediumRiskAlerts'));
    let lowAlertThreshold: number = parseInt(task.getInput('maxLowRiskAlerts'));

    let scanOptions: ZapActiveScanOptions = {
        zapapiformat: 'JSON',
        apikey: zapApiKey,
        formMethod: 'GET',        
        url: targetUrl,
        recurse: String(recurse),
        inScopeOnly: String(inScopeOnly),
        scanPolicyName: scanPolicyName,
        method: method,
        postData: postData,
        contextId: contextId
    };

    let requestOptions: request.UriOptions & requestPromise.RequestPromiseOptions = {
        uri: `http://${zapApiUrl}/JSON/ascan/action/scan/`,
        qs: scanOptions
    };

    task.debug(`Target URL: http://${zapApiUrl}/JSON/ascan/action/scan/`);
    task.debug(`Scan Options: ${JSON.stringify(scanOptions)}`);


    requestPromise(requestOptions)
        .then(async res => {
            let result: ZapActiveScanResult = JSON.parse(res);
            console.log(`OWASP ZAP Active Scan Initiated. ID: ${result.scan}`);

            while (true) {
                sleep(8000);
                let scanStatus: number = await getActiveScanStatus(result.scan, zapApiKey, zapApiUrl);
                
                if(scanStatus >= 100) {
                    console.log(`Scan In Progress: ${scanStatus}%`);
                    console.log('Active scan complete...');
                    break;
                }
                console.log(`Scan In Progress: ${scanStatus}%`);
            }

        })
        .error(err => {
            task.warning('Failed to initiate the active scan.');
            task.setResult(task.TaskResult.Failed, `Failed to initiate the active scan. Error: ${err}`);
        });
   
}   

run();

function getActiveScanStatus(scanId: number, apiKey: string, zapApiUrl: string): Promise<number> {
    let statusOptions: ZapActiveScanStatusOptions = {
        zapapiformat: 'JSON',
        apikey: apiKey,
        formMethod: 'GET',
        scanId: scanId
    };

    let requestOptions: request.UriOptions & requestPromise.RequestPromiseOptions = {
        uri: `http://${zapApiUrl}/JSON/ascan/view/status/`,
        qs: statusOptions
    };

    task.debug(`ZAP API Call: http://${zapApiUrl}/JSON/ascan/view/status/`);
    task.debug(`Request Options: ${JSON.stringify(statusOptions)}`);

    return new Promise<number>((resolve, reject) => {
        requestPromise(requestOptions)
            .then(res => {
                let result: ZapActiveScanStatus = JSON.parse(res);
                task.debug(`Scan Status Result: ${JSON.stringify(result)}`);
                
                resolve(result.status);
            })
            .error(err => {
                reject(-1);
            });
    });        
}


class Constants {
    // Report Type
    static HtmlReport: string = 'htmlreport';
    static XmlReport: string = 'xmlreport';
    static MdReport: string = 'mdreport';

    // Risk Code
    static HighRisk: string = '3';
    static MediumRisk: string = '2';
    static LowRisk: string = '1';
}

enum ReportType {
    XML,
    HTML,
    MD
}

// ZAP Request Interfaces
interface ZapScanOptionsBase {
    zapapiformat: string;
    formMethod: string;
    apikey: string;
}

interface ZapActiveScanOptions extends ZapScanOptionsBase {    
    url: string;
    recurse?: string;
    inScopeOnly?: string;
    scanPolicyName?: string;
    method?: string;
    postData?: string;
    contextId?: string;
}

interface ZapActiveScanStatusOptions extends ZapScanOptionsBase {
    scanId: number;
}

interface ZapScanReportOptions {
    formMethod: string;
    apikey: string;
}

interface ZapActiveScanResult {
    scan: number;
}

interface ZapActiveScanStatus {
    status: number;
}

// ZAP Report interfaces
interface ScanReport {
    OWASPZAPReport: OWASPZAPReport
}

interface OWASPZAPReport {
    site: site;
    $: { version: string, generated: string };
}

interface site {
    $: {
        name: string,
        host: string,
        port: string,
        ssl: string,
    };
    alerts: alerts;
}

interface alerts {
    alertitem: Array<alertitem>;
}

interface alertitem {
    pluginid: string;
    alert: string;
    name: string;
    riskcode: string;
    confidence: string;
    riskdesc: string;
    desc: string;
    instances: instances;
    count: string;
    solution: string;
    reference: string;
    cweid: string;
    wascid: string;
    sourceid: string;
    otherinfo: string;
}

interface instances {
    instance: Array<instance>
}

interface instance {
    uri: string;
    method: string;
    evidence: string;
    param: string;
}