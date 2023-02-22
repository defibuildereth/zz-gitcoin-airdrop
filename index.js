import dotenv from "dotenv";
import { createObjectCsvWriter } from "csv-writer";
import Bottleneck from "bottleneck";
import * as fs from "fs";

let startTime = Date.now();

const finalInfo = createObjectCsvWriter({
    path: `./gitcoinAirdrop-${startTime}.csv`,
    header: [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'from', title: 'From Address' },
        { id: 'token', title: 'Token' },
        { id: 'tokenAmount', title: 'Token Amount' },
        { id: 'usdValue', title: '$USD Value' },
        { id: 'network', title: 'Network' },
        { id: 'txHash', title: 'Transaction Hash' }
    ]
});

dotenv.config();

const tokensFile = 'token-api-results.json';
const pricesFile = 'prices-api-results.json';
const addressesFile = 'bulk-gitcoin-addresses.json';
let stables = ['usdc', 'usdt', 'dai']

const coingecko = new Map();
coingecko.set('wbtc', 'wrapped-bitcoin');
coingecko.set('eth', 'ethereum');
coingecko.set('weth', 'ethereum')
coingecko.set('rai', 'rai')
coingecko.set('uni', 'uniswap')
coingecko.set('storj', 'storj')
coingecko.set('link', 'chainlink')
coingecko.set('mkr', 'maker')
coingecko.set('mana', 'decentraland')

let polygonscanApiKey = process.env.POLYGONSCAN;
let etherscanApiKey = process.env.ETHERSCAN;

const polygonscan = new Bottleneck({
    maxConcurrent: 1,
    minTime: 250
});

const etherscan = new Bottleneck({
    maxConcurrent: 1,
    minTime: 250
});

const zkscan = new Bottleneck({
    maxConcurrent: 1,
    minTime: 250
});

const coingeckoApi = new Bottleneck({
    maxConcurrent: 1,
    minTime: 6500
});

let donationAddress = '0x9b67d3067fa606be28e56c1ab184725c07b7b221';
let gitcoinAddress = '0x7d655c57f71464b6f83811c55d84009cd9f5221c';

const getZkTransactions = async function (address, tx, index) {

    console.log('calling getZkTransactions with tx: ', tx)
    const result = await zkscan.schedule(async () => {
        await fetch(`https://api.zksync.io/api/v0.2/accounts/${address}/transactions?from=${tx}&limit=100&direction=older`)
            .then((res) => res.json())
            .then(async data => {
                for (let i = index; i < data.result.list.length; i++) {
                    // console.log(data.result.list[i])
                    let txInfo = await parseTxInfo(data.result.list[i], 'zksync')
                    if (txInfo) {
                        await finalInfo.writeRecords([txInfo])
                    }
                }
                return data
            })
            .then((data) => {
                if (data.result.list.length > 99) {
                    getZkTransactions(address, data.result.list[99].txHash, 1)
                }
                else {
                    console.log('zk txs done')
                }
            });
    })

}

const getEthTransactions = async function (address, num) {
    console.log('calling getEthTransactions with num: ', num)
    const result = await etherscan.schedule(async () => {
        await fetch(`https://api.etherscan.io/api` +
            `?module=account` +
            `&action=txlist` +
            `&address=${address}` +
            `&startblock=0` +
            `&endblock=99999999` +
            `&page=${num}` +
            `&offset=100` +
            `&sort=asc` +
            `&apikey=${etherscanApiKey}`)
            .then(res => res.json())
            .then(async data => {
                for (let i = 0; i < data.result.length; i++) {
                    let txInfo = await parseTxInfo(data.result[i], 'ethereum txs')
                    if (txInfo) {
                        await finalInfo.writeRecords([txInfo])
                    }
                }
            })
    })
}

const getMaticTransactions = async function (address, num) {
    console.log('calling getMaticTransactions with num: ', num)
    const result = await polygonscan.schedule(async () => {
        await fetch(
            `https://api.polygonscan.com/api` +
            `?module=account` +
            `&action=txlist` +
            `&address=${address}` +
            `&startblock=0` +
            `&endblock=99999999` +
            `&page=1` +
            `&offset=10000` +
            `&sort=asc` +
            `&apikey=${polygonscanApiKey}`
        )
            .then(res => res.json())
            .then(async data => {
                for (let i = 0; i < data.result.length; i++) {
                    let txInfo = await parseTxInfo(data.result[i], 'polygon txs')
                    if (txInfo) {
                        await finalInfo.writeRecords([txInfo])
                    }
                }
            })
    })
}

const getMaticTokens = async function (address, num) {
    console.log('calling getMaticTokens', num)
    const result = await polygonscan.schedule(async () => {
        await fetch(
            `https://api.polygonscan.com/api` +
            `?module=account` +
            `&action=tokentx` +
            `&address=${address}` +
            `&startblock=0` +
            `&endblock=99999999` +
            `&page=1` +
            `&offset=10000` +
            `&sort=asc` +
            `&apikey=${polygonscanApiKey}`
        )
            .then(res => res.json())
            .then(async data => {
                // console.log(data.result.length)
                for (let i = 0; i < data.result.length; i++) {
                    let txInfo = await parseTxInfo(data.result[i], 'polygon tokens')
                    if (txInfo) {
                        await finalInfo.writeRecords([txInfo])
                    }
                }
            })
    })
}

const getEthTokens = async function (address) {
    console.log('calling getEthTokens')
    const result = await etherscan.schedule(async () => {
        await fetch(
            `https://api.etherscan.io/api` +
            `?module=account` +
            `&action=tokentx` +
            `&address=${address}` +
            `&page=1` +
            `&offset=1000` +
            `&startblock=0` +
            `&endblock=99999999` +
            `&sort=asc` +
            `&apikey=${etherscanApiKey}`
        )
            .then(res => res.json())
            .then(async data => {
                // console.log(data.result.length)
                for (let i = 0; i < data.result.length; i++) {
                    let txInfo = await parseTxInfo(data.result[i], 'ethereum tokens')
                    if (txInfo) {
                        await finalInfo.writeRecords([txInfo])
                    }
                }
            })
    })
}

const getEthInternal = async function (address) {
    console.log('calling getEthInternal')
    const result = await etherscan.schedule(async () => {
        await fetch(
            `https://api.etherscan.io/api` +
            `?module=account` +
            `&action=txlistinternal` +
            `&address=${address}` +
            `&startblock=0` +
            `&endblock=99999999` +
            `&page=1` +
            `&offset=1000` +
            `&sort=asc` +
            `&apikey=${etherscanApiKey}`
        )
            .then(res => res.json())
            .then(async data => {
                console.log(data.result.length)
                for (let i = 0; i < data.result.length; i++) {
                    let txInfo = await parseTxInfo(data.result[i], 'ethereum internal')
                    // console.log(txInfo)
                    if (txInfo) {
                        await finalInfo.writeRecords([txInfo])
                    }
                }
            })
    })
}

async function parseTxInfo(tx, networkSymbol) {
    if (networkSymbol === 'zksync') {
        if (tx.op.to === donationAddress && tx.status === 'finalized') {
            // console.log(tx)
            let txHash = tx.txHash;
            let fromAddress = tx.op.from;
            let token = await getZkTokenInfo(tx.op.token) // store locally
            if (token) {
                let tokenDecimals = token.decimals;
                let tokenAmount = (tx.op.amount * 10 ** - tokenDecimals).toFixed(6);
                let price;
                if (stables.includes(token.symbol.toLowerCase())) {
                    price = 1
                } else {
                    let coingeckoDate = formatZkDate(tx.createdAt)
                    let coingeckoSymbol = getCoingeckoSymbol(token.symbol.toLowerCase());
                    price = await findPrice(coingeckoSymbol, coingeckoDate) //store locally
                }
                if (price) {
                    let usdValue = (price * tokenAmount).toFixed(6);
                    let network = networkSymbol
                    let date = new Date(tx.createdAt)
                    let timestamp = date.getTime();

                    return {
                        timestamp: timestamp,
                        from: fromAddress,
                        token: token.symbol,
                        tokenAmount: tokenAmount,
                        usdValue: usdValue,
                        network: network,
                        txHash: txHash,
                    }
                }
            }

        } else {
            console.log('outgoing/ non-finalized')
        }
    }
    else if (networkSymbol.slice(0, 8) === 'ethereum') {
        if (tx.to === donationAddress && tx.from !== donationAddress) {
            let timestamp = Number(tx.timeStamp) * 1000
            let tokenAmount, price, token, fromAddress, coingeckoDate;
            if (networkSymbol === 'ethereum txs') {
                fromAddress = tx.from
                token = 'ETH'
                tokenAmount = Number(tx.value * 10 ** -18).toFixed(6)
                coingeckoDate = timestampToDate(Number(timestamp))
                price = await findPrice('ethereum', coingeckoDate)
            } else if (networkSymbol == 'ethereum tokens') {
                fromAddress = tx.from
                token = tx.tokenSymbol
                tokenAmount = Number(tx.value * 10 ** -tx.tokenDecimal).toFixed(6)
                if (stables.includes(token.toLowerCase())) {
                    price = 1
                } else {
                    let coingeckoSymbol = getCoingeckoSymbol(token.toLowerCase());
                    price = await findPrice(coingeckoSymbol, coingeckoDate)
                }
            } else if (networkSymbol == 'ethereum internal') {
                fromAddress = await findFromAddress(tx)
                token = 'ETH'
                tokenAmount = Number(tx.value * 10 ** -18).toFixed(6)
                coingeckoDate = timestampToDate(Number(timestamp))
                price = await findPrice('ethereum', coingeckoDate)
            }
            if (price) {
                let usdValue = (price * tokenAmount).toFixed(6);
                let network = 'ethereum'
                let txHash = tx.hash
                return {
                    timestamp: timestamp,
                    from: fromAddress,
                    token: token,
                    tokenAmount: tokenAmount,
                    usdValue: usdValue,
                    network: network,
                    txHash: txHash,
                }
            } else {
                console.log('error getting price', tx)
            }
        }
    }
    else if (networkSymbol.slice(0, 7) === 'polygon') {
        if (tx.to === donationAddress && tx.from !== donationAddress) {
            let timestamp = Number(tx.timeStamp) * 1000
            let fromAddress = tx.from
            let tokenAmount, price, token;
            let coingeckoDate = timestampToDate(Number(timestamp))
            if (networkSymbol === 'polygon txs') {
                token = 'MATIC'
                tokenAmount = Number(tx.value * 10 ** -18).toFixed(6)
                coingeckoDate = timestampToDate(Number(timestamp))
                price = await findPrice('matic-network', coingeckoDate)
            } else if (networkSymbol == 'polygon tokens') {
                token = tx.tokenSymbol
                tokenAmount = Number(tx.value * 10 ** -tx.tokenDecimal).toFixed(6)
                if (stables.includes(token.toLowerCase())) {
                    price = 1
                } else {
                    let coingeckoSymbol = getCoingeckoSymbol(token.toLowerCase());
                    price = await findPrice(coingeckoSymbol, coingeckoDate)
                }
            }
            if (price) {
                let usdValue = (price * tokenAmount).toFixed(6);
                let network = 'polygon'
                let txHash = tx.hash
                return {
                    timestamp: timestamp,
                    from: fromAddress,
                    token: token,
                    tokenAmount: tokenAmount,
                    usdValue: usdValue,
                    network: network,
                    txHash: txHash,
                }
            } else {
                console.log('error getting price', tx)
            }
        }
    }
    else {
        console.log(`network symbol not recognised: ${networkSymbol}`)
    }
}

async function findFromAddress(tx) {
    let key = tx.hash;
    if (fs.existsSync(addressesFile)) {
        const data = fs.readFileSync(addressesFile)
        const jsonData = JSON.parse(data)
        if (jsonData[key]) {
            return jsonData[key]
        }
    }
    let address;
    const result = await etherscan.schedule(async () => {
        await fetch(
            `https://api.etherscan.io/api` +
            `?module=account` +
            `&action=txlist` +
            `&address=${tx.from}` +
            `&startblock=${tx.blockNumber}` +
            `&endblock=${tx.blockNumber}` +
            `&page=1` +
            `&offset=10` +
            `&sort=asc` +
            `&apikey=${etherscanApiKey}`
        )
            .then(res => res.json())
            .then(async data => {
                address = data.result[0].from
                const jsonData = { ...JSON.parse(fs.readFileSync(addressesFile)), [key]: address };
                fs.writeFileSync(addressesFile, JSON.stringify(jsonData));
                return address
            })
    })
}

function timestampToDate(timestamp) {
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function formatZkDate(dateString) {
    const date = new Date(dateString);
    const day = date.getUTCDate().toString().padStart(2, '0');
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = date.getUTCFullYear().toString();
    return `${day}-${month}-${year}`;
}

function getCoingeckoSymbol(symbol) {
    if (coingecko.get(symbol)) {
        return coingecko.get(symbol)
    } else {
        console.log('need coingecko symbol for ', symbol)
    }
}

async function getZkTokenInfo(int) {
    let result;

    // Check if file exists and contains result for this int value
    if (fs.existsSync(tokensFile)) {
        const data = fs.readFileSync(tokensFile);
        const jsonData = JSON.parse(data);
        if (jsonData[int]) {
            return jsonData[int];
        }
    }

    // If result not found in file, make API call
    console.log('API call for int: ', int);
    await fetch(`https://api.zksync.io/api/v0.2/tokens/${int}`)
        .then(res => res.json())
        .then(data => {
            if (data.result) {
                result = data.result;
                // Save result to file
                const jsonData = { ...JSON.parse(fs.readFileSync(tokensFile)), [int]: result };
                fs.writeFileSync(tokensFile, JSON.stringify(jsonData));
                console.log('Result saved to file:', result);
            }
        })
        .catch(err => console.error(err));

    return result;
}

const findPrice = async function (tokenId, date) {
    let key = tokenId + '-' + date

    if (fs.existsSync(pricesFile)) {
        const data = fs.readFileSync(pricesFile)
        const jsonData = JSON.parse(data)
        if (jsonData[key]) {
            return jsonData[key]
        }
    }
    let result, price;
    const call = await coingeckoApi.schedule(async () => {
        console.log('API call: ', key)
        await fetch(`https://api.coingecko.com/api/v3/coins/${tokenId}/history?date=${date}`)
            .then(r => r.json())
            .then(res => {
                if (res.market_data) {
                    price = res.market_data.current_price.usd
                    result = price
                    const jsonData = { ...JSON.parse(fs.readFileSync(pricesFile)), [key]: result };
                    fs.writeFileSync(pricesFile, JSON.stringify(jsonData));
                }
            })
            .catch(err => console.error(err));
    })
    return price
}

// getZkTransactions(donationAddress, 'latest', 0, 0)
// getEthTransactions(donationAddress, 1)
// getEthTokens(donationAddress)
// getMaticTransactions(donationAddress, 1)
// getMaticTokens(donationAddress, 1)
getEthInternal(donationAddress)

let exampleInternalEth = {
    "blockNumber": "13799426",
    "timeStamp": "1639432593",
    "hash": "0x9b90bdb777ae1418b8557a75a6baa986bc7e2f92f0f750446c0f480ecff60db9",
    "from": "0x7d655c57f71464b6f83811c55d84009cd9f5221c",
    "to": "0x9b67d3067fa606be28e56c1ab184725c07b7b221",
    "value": "27000000000000000",
    "contractAddress": "",
    "input": "",
    "type": "call",
    "gas": "70928",
    "gasUsed": "0",
    "traceId": "0",
    "isError": "0",
    "errCode": ""
}

// console.log(await parseTxInfo(exampleInternalEth, 'ethereum internal'))