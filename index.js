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

let tokens = [];
const tokensFile = 'token-api-results.json';
const pricesFile = 'prices-api-results.json';
let prices = [];
let stables = ['usdc', 'usdt', 'dai']

const coingecko = new Map();
coingecko.set('wbtc', 'wrapped-bitcoin');
coingecko.set('eth', 'ethereum');
coingecko.set('weth', 'ethereum')
coingecko.set('rai', 'rai')
coingecko.set('uni', 'uniswap')
coingecko.set('storj', 'storj')
coingecko.set('link','chainlink')
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

async function parseTxInfo(tx, networkSymbol) {
    if (networkSymbol == 'zksync') {
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
            let fromAddress = tx.from
            let tokenAmount, price, token;
            let coingeckoDate = timestampToDate(Number(timestamp))
            if (networkSymbol === 'ethereum txs') {
                token = 'ETH'
                tokenAmount = Number(tx.value * 10 ** -18).toFixed(6)
                coingeckoDate = timestampToDate(Number(timestamp))
                price = await findPrice('ethereum', coingeckoDate)
            } else if (networkSymbol == 'ethereum tokens') {
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
        if (tx.to === donationAddress  && tx.from !== donationAddress) {
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
    } else {
        console.log(`network symbol not recognised: ${networkSymbol}`)
    }
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
    // If result not found in file, make API call
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

// const findPrice = async function (tokenId, date) {
//     if (stables.includes(tokenId)) {
//         return 1
//     }
//     if (prices[tokenId + '-' + date]) {
//         return prices[tokenId + '-' + date]
//     } else {
//         let price;
//         const result = await coingeckoApi.schedule(async () => {
//             console.log('calling api', tokenId, date)
//             await fetch(`https://api.coingecko.com/api/v3/coins/${tokenId}/history?date=${date}`)
//                 .then(r => r.json())
//                 .then(res => {
//                     if (res.market_data) {
//                         price = (res.market_data.current_price.usd)
//                     }
//                     else {
//                         console.log('problem getting price, ', res)
//                     }
//                 })
//         })
//         if (price) {
//             prices[tokenId + '-' + date] = price
//             return price
//         } else {
//             console.log('error getting coingecko price: ', tokenId, date)
//         }
//     }
// }

getZkTransactions(donationAddress, 'latest', 0, 0)
getEthTransactions(donationAddress, 1)
getEthTokens(donationAddress)
getMaticTransactions(donationAddress, 1)
getMaticTokens(donationAddress, 1)

let exampleTx = {
    txHash: '0xf98789db93c7ab0e124ed906ff4bbbd718ca7b5a87208df0972eb0bd2e69b50e',
    blockIndex: 17,
    blockNumber: 87667,
    op: {
        type: 'Transfer',
        accountId: 851948,
        from: '0x978d5a5e2f908a7475b230c3266ba61ccbd9aed8',
        to: '0x9b67d3067fa606be28e56c1ab184725c07b7b221',
        token: 1,
        amount: '1000000000000000000',
        fee: '0',
        nonce: 9,
        validFrom: 0,
        validUntil: 4294967295,
        signature: {
            pubKey: 'eb5b3011210ea45afaca7cdaee04c78c59f8d97089c414f772ee6c9401dafe20',
            signature: 'bf1aafc4cf8c05565316800e91aa78c41258e6198483d6dbffd17d18f6351d8113d504beba616543e5782d4cfb32163f6b81bf3fcc1c024bdb8880b891275304'
        }
    },
    status: 'finalized',
    failReason: null,
    createdAt: '2022-06-19T15:30:39.252700Z',
    batchId: 1568059
}

let exampleTx2 = {
    txHash: '0x879950aec908198854e8242a4989a97a5c3607f82a7997c1272aed6b1a4450bd',
    blockIndex: 2,
    blockNumber: 138984,
    op: {
        type: 'Transfer',
        accountId: 879505,
        from: '0xd99bd5cef9681b5cbf78b02827a69998704b5f80',
        to: '0x9b67d3067fa606be28e56c1ab184725c07b7b221',
        token: 2,
        amount: '100000',
        fee: '22700',
        nonce: 57,
        validFrom: 0,
        validUntil: 4294967295,
        signature: {
            pubKey: '970ec0554c297562a84be4a8cc31452dee94bdf45dd6b9f5c0f62a34070aa897',
            signature: 'fb1bfdd901d9f0cdf9c77c194501cbff2083731e657d7a1cdb8edfd766987087a76bd1cc42bb04562e0d13083075fcd8c6b5895bc97d978c070887eda3770502'
        }
    },
    status: 'finalized',
    failReason: null,
    createdAt: '2022-12-06T20:47:38.031099Z',
    batchId: 2621971
}

let exampleEthTx = {
    blockNumber: '14700748',
    timeStamp: '1651528156',
    hash: '0xf4f20977ca9b5029ca63e4ea05060474c30f9a3cf9149a319e5a171576862548',
    nonce: '21',
    blockHash: '0x5e021a3e3780d7e32c37f46a9ce5f954432d0439753506109341dc961b11a0f8',
    transactionIndex: '208',
    from: '0x6e8e73631369cea39cdbda187b24dd2f2f8e90bb',
    to: '0x9b67d3067fa606be28e56c1ab184725c07b7b221',
    value: '18000000000000000',
    gas: '21000',
    gasPrice: '84194059583',
    isError: '0',
    txreceipt_status: '1',
    input: '0x',
    contractAddress: '',
    cumulativeGasUsed: '23247082',
    gasUsed: '21000',
    confirmations: '1976612',
    methodId: '0x',
    functionName: ''
}

let exampleEthTokens = {
    blockNumber: '15013014',
    timeStamp: '1655988474',
    hash: '0xfb7bb9a29aef329785a9639a236c538aa27b64ddecc6185c11a80c949eb74325',
    nonce: '241',
    blockHash: '0x0d18fa303aef0c5ff3dc2959d0563abdcbab8198a8048b4d9e33b90bdbc9d3a2',
    from: '0x00622116402f303f22d38f3ec202774f183f6468',
    contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    to: '0x9b67d3067fa606be28e56c1ab184725c07b7b221',
    value: '10000000',
    tokenName: 'USD Coin',
    tokenSymbol: 'USDC',
    tokenDecimal: '6',
    transactionIndex: '238',
    gas: '700000',
    gasPrice: '33314312000',
    gasUsed: '208738',
    cumulativeGasUsed: '23652659',
    input: 'deprecated',
    confirmations: '1664568'
}

let exampleMaticTokens = {
    blockNumber: '22576673',
    timeStamp: '1639625423',
    hash: '0xd9cd1466f1d61c90af5becba46f5e8db9d26d33db5cf9662c290fbef83a68534',
    nonce: '5',
    blockHash: '0x5c28caf27fd98bf207163c5248f9145b7040294eb065b73b54e42fb0d54fbd1a',
    from: '0xe76539ea9ec18cdf9d794f07f0fe9462257b07a9',
    contractAddress: '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
    to: '0x9b67d3067fa606be28e56c1ab184725c07b7b221',
    value: '1200000000000000000',
    tokenName: '(PoS) Dai Stablecoin',
    tokenSymbol: 'DAI',
    tokenDecimal: '18',
    transactionIndex: '43',
    gas: '990000',
    gasPrice: '30000000000',
    gasUsed: '860510',
    cumulativeGasUsed: '6693919',
    input: 'deprecated',
    confirmations: '16979082'
}

// console.log(await parseTxInfo(exampleEthTokens, 'ethereum tokens'))
// console.log(await parseTxInfo(exampleMaticTokens, 'polygon tokens'))