console.log("Mohan Pal");
const original_array = ['2','7','10','11'];
console.log(original_array);
console.log(" --------- copy of array -------------");
const copy = original_array;
copy.push('30');
console.log("copy ",copy);
console.log("original",original_array)
let a = 26;
let b = a;
b = 36;
console.log(b);
console.log("-------------- foreach loop --------------")
original_array.forEach((item,ind)=>{
    console.log(`Item value is ${item} and index value is ${ind}`);
});
console.log("---------- Map function ---------")
const map_array = original_array.map((item)=>{
    console.log(item);
    return item*item;
});
console.log(map_array);
console.log("-----Arrow function------");
function add(a,b){
    console.log(a+b);
}
add(2,3);
const arrowAdd = (a,b) => a+b;
console.log(arrowAdd(6,8));
console.log("Return Object in row function");

console.log("Difference between normal function and arrow function.");
const obj = [
    {
        name:"moahn",
        age:30,
        show:function(){
            console.log("HI "+this.name+", your age is "+this.age*2);
            return 1;
        },
        arrows:()=>{
            console.log("HI "+this.name+", your age is "+this.age*2);
            console.log("Age and name will not be assigned due to the scope");
            
        }
    },
     {
        name:"rohan",
        age:40,
        show:function(){
            console.log("HI "+this.name+", your age is "+this.age*2);
            return 1;
        },
        arrows:()=>{
           
            console.log("HI "+this.name+", your age is "+this.age*2);
            console.log("Age and name will not be assigned due to the scope");
            
        }
    }
]
console.log("dhdh",obj[1].arrows());
const newObj = obj.map(user => (
{
    ...user,
    st:user.age>30?'Adult':"in"
    
}

))
//console.log(obj);
//const v = obj.show();obj.arrows();
//console.log(newObj)

const orders = [
  { id: 1, items: [{ price: 30 }, { price: 5 }] },
  { id: 2, items: [{ price: 80 }, { price: 100 }] },
  { id: 3, items: [{ price: 10 }] }
];

const result = orders.map(order =>{
    return order.items.map((item)=>{
        return {
            //console.log(item.price)
            p:item.price,
            id : order.id,
     
        }
    }
    )
});
const result11 = orders.flatMap(order =>
    order.items.map(item =>({
        id:order.id,
        price:item.price
    })
    )
)
//console.log(result11);
console.log("============ spread operator and rest operator ============ ");

const user = { name_epm: "Rohan", age: 30, city: "Delhi" };

const { name_epm, ...other } = user;
console.log(name_epm);
console.log(other);


const employee = {
  name: "Rahul",
  salary: 50000,
  password: "secret@123",
  dept: "IT"
};

const { password, ...safeData } = employee;

console.log(password);
