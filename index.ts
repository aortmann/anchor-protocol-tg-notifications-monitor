import { columbus5, AddressProviderFromJson, MARKET_DENOMS, Earn } from "@anchor-protocol/anchor.js";
import { LCDClient, Dec } from "@terra-money/terra.js";
import "dotenv/config";
import moment from "moment";
//@ts-ignore
import fetch from 'node-fetch';

interface EpochStateResponse {
  exchange_rate: string;
  aterra_supply: string;
}
// https://lcd.terra.dev/swagger-ui/#/
const myAddress = process.env.TERRA_ADDR;
if (!myAddress) throw new Error(`Undefined .env value: 'TERRA_ADDR'`)
let depositTxs:string | string[] | undefined = process.env.TERRA_DEPOSIT_TX;
if (!depositTxs) throw new Error(`Undefined .env value: 'TERRA_DEPOSIT_TX'`)
depositTxs = depositTxs.split(',')
const market = "uusd";
const addressProvider = new AddressProviderFromJson(columbus5);
const lcd = new LCDClient({ URL: 'https://lcd.terra.dev', chainID: 'columbus-5' });
//@ts-ignore
const marketContractAddress = addressProvider.market(market);
//@ts-ignore
const tokenAddress = addressProvider.aTerra(market);
console.log(`Checking address : ${process.env.TERRA_ADDR}`);

(async () => {
  const { exchange_rate, aterra_supply }: EpochStateResponse = await lcd.wasm.contractQuery(
    marketContractAddress,
    {
      epoch_state: {
        block_height: undefined,
      },
    },
  );
  let depositTime:any, depositSinceHours:any, depositSinceDays, depositSinceWeeks, depositSinceMonths;
  let depositedBalance = new Dec(0);
  let depositedBalanceRaw;

  for (const tx of depositTxs) {
    const { logs, timestamp } = await lcd.tx.txInfo(tx);
    //const depositTime:any = new Date(new Date(res.timestamp).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }));
    //const dateNow:any = new Date(new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }));
    
    
    depositTime = depositTime? `${depositTime} + ${moment(timestamp)}`: moment(timestamp);
    const dateNow = moment();
    depositSinceHours = depositSinceHours? `${depositSinceHours} + ${dateNow.diff(moment(timestamp), 'hours', true).toFixed(2)}` : dateNow.diff(moment(timestamp), 'hours', true).toFixed(2);

    if(logs) {
      depositedBalance = depositedBalance.add(new Dec(logs[0].events.filter(e => e.type === 'wasm')[0].attributes.filter(a => a.key === 'deposit_amount')[0].value).div(1000000));
      depositedBalanceRaw = `${depositedBalanceRaw? `${depositedBalanceRaw} + ` : ''}${new Dec(logs[0].events.filter(e => e.type === 'wasm')[0].attributes.filter(a => a.key === 'deposit_amount')[0].value).div(1000000).toFixed(2)}`;
    }
  }

  let depositedBalanceMessage;
  if(depositTime && depositedBalance) {
    depositedBalanceMessage = `Deposited: ${depositTime}\nDeposited since: ${depositSinceHours} hours ago\nInitial balance: ${depositedBalanceRaw} UST`;
    console.log(depositedBalanceMessage);
  }

  const { balance } = await lcd.wasm.contractQuery(tokenAddress, { balance: { address: myAddress } });
  const deposit = 
    new Dec(exchange_rate).mul(balance)
    .div(1000000)
    .toFixed(2)
    .toString();
  const balanceMessage = `Current balance: ${deposit} UST`;
  console.log(balanceMessage);

  let totalYieldMessage = undefined;
  if(depositedBalance) {
    totalYieldMessage = `Total yield: ${(new Dec(deposit).sub(depositedBalance)).toFixed(2)} UST`;
  }

  const apy = await new Earn(lcd, new AddressProviderFromJson(columbus5)).getAPY({market: MARKET_DENOMS.UUSD});

  if(depositTime && depositedBalance && depositSinceHours) {
    const averagePerHour = `\n----------\n\nAverage per hour: ${(new Dec(deposit).mul(apy).div(8760)).toFixed(2)} UST`;
    //@ts-ignore
    const averagePerDay = `Average per day: ${(new Dec(deposit).mul(apy).div(365.25)).toFixed(2)} UST`;
    //@ts-ignore
    const averagePerWeek = `Average per week: ${(new Dec(deposit).mul(apy).div(52.1775)).toFixed(2)} UST`;
    //@ts-ignore
    const averagePerMonth = `Average per month: ${(new Dec(deposit).mul(apy).div(12)).toFixed(2)} UST`;
    //@ts-ignore
    const averagePerYear = `Average per year: ${(new Dec(deposit).mul(apy)).toFixed(2)} UST`;
    totalYieldMessage += `\n${averagePerHour}\n${averagePerDay}\n${averagePerWeek}\n${averagePerMonth}\n${averagePerYear}`;
  }

  console.log(totalYieldMessage)

  const APYMessage = `Current APY: ${(apy * 100).toFixed(2)}%`;
  console.info(APYMessage);

  const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
  const TG_CHAT_ID = process.env.TG_CHAT_ID;

  if(TG_BOT_TOKEN && TG_CHAT_ID) {
    await fetch(`https://api.telegram.org/${TG_BOT_TOKEN}/sendMessage?chat_id=${TG_CHAT_ID}&parse_mode=html&text=${encodeURIComponent(`${depositedBalanceMessage? depositedBalanceMessage + '\n' : ''}${balanceMessage}\n${totalYieldMessage? totalYieldMessage + '\n' : ''}${APYMessage}`)}`)
  }
})();
