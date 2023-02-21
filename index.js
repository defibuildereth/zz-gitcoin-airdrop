import dotenv from "dotenv";
import { createObjectCsvWriter } from "csv-writer";
import Bottleneck from "bottleneck";

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
let prices = [];
let stables = ['usdc', 'usdt', 'dai']

const coingecko = new Map();
coingecko.set('wbtc', 'wrapped-bitcoin');
coingecko.set('eth', 'ethereum');

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
                    let txInfo = await parseZkSyncTxInfo(data.result.list[i])
                    await finalInfo.writeRecords([txInfo])
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

async function parseZkSyncTxInfo(tx) {
    if (tx.op.to === donationAddress && tx.status === 'finalized') {
        // console.log(tx)
        let txHash = tx.txHash;
        let fromAddress = tx.op.from;
        let token = await getZkTokenInfo(tx.op.token) // store locally
        let tokenDecimals = token.decimals;
        let tokenAmount = tx.op.amount * 10 ** - tokenDecimals;
        let price;
        if (stables.includes(token.symbol.toLowerCase())) {
            price = 1
        } else {
            let coingeckoDate = formatDate(tx.createdAt)
            let coingeckoSymbol = getCoingeckoSymbol(token.symbol.toLowerCase());
            price = await findPrice(coingeckoSymbol, coingeckoDate) //store locally
        }
        let usdValue = price * tokenAmount;
        let network = 'zkSync'
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
    } else {
        console.log('outgoing/ non-finalized')
    }
}

function formatDate(dateString) {
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
    if (tokens[int]) {
        return tokens[int]
    } else {
        let decimals, symbol;
        console.log('calling api', int)
        await fetch(`https://api.zksync.io/api/v0.2/tokens/${int}`)
            .then(res => res.json())
            .then(data => {
                symbol = data.result.symbol
                decimals = data.result.decimals
                return { symbol: symbol, decimals: decimals, coingecko: coingecko }
            })
            .then(info => {
                tokens[int] = info
            })
        return { symbol: symbol, decimals: decimals }
    }
}

const findPrice = async function (tokenId, date) {
    if (stables.includes(tokenId)) {
        return 1
    }
    if (prices[tokenId + '-' + date]) {
        return prices[tokenId + '-' + date]
    } else {
        let price;
        const result = await coingeckoApi.schedule(async () => {
            console.log('calling api', tokenId, date)
            await fetch(`https://api.coingecko.com/api/v3/coins/${tokenId}/history?date=${date}`)
                .then(r => r.json())
                .then(res => {
                    if (res.market_data) {
                        price = (res.market_data.current_price.usd)
                    }
                    else {
                        console.log('problem getting price, ', res)
                    }
                })
        })
        if (price) {
            prices[tokenId + '-' + date] = price
            return price
        } else {
            console.log('error getting coingecko price: ', tokenId, date)
        }
    }
}

getZkTransactions(donationAddress, 'latest', 0, 0)


const getEthTransactions = async function (address, tx, index) {

}


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

// console.log(await parseZkSyncTxInfo(exampleTx2))