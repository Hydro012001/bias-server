const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const app = express();
const axios = require("axios");
require("dotenv").config();
const bcrypt = require("bcrypt");
const currentDate = new Date(new Date().setMonth(new Date().getMonth() + 3));
const salt = 10;
app.use(cors());
app.use(express.json());

app.listen(process.env.PORT, () => {
  console.log("running");
});

const db = mysql.createConnection({
  host: process.env.HOST_KEY,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DB_NAME,
});

app.post("/admin/login", (req, res) => {
  const { pass, email } = req.body;

  db.query(
    "select * from usertbl where user_email =? and user_password=?",
    [email, pass],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        if (result.length > 0) {
          res.send({ status: true, message: "Login successfully", result });
        } else {
          res.send({ status: true, message: "Account not found" });
        }
      }
    }
  );
});

app.post("/businessfunds", (req, res) => {
  const { buss_id } = req.body;
  const bussFundSql = "select * from businessfunds where bussFunds_buss_id = ?";

  const todayDate = new Date(new Date().setMonth(new Date().getMonth() + 1));
  db.query(bussFundSql, buss_id, (error, result) => {
    if (error) {
      return res.send({ status: false, message: error.message });
    } else {
      return res.send({ status: true, result, todayDate });
    }
  });
});

app.post("/paypal-api", async (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.SECRET_KEY_PAYPAL;
  const accessToken = btoa(`${clientId}:${clientSecret}`);
  const payoutBacthId = req.body.payout_batchId;
  const amount = req.body.amount;
  const product = req.body.product;
  const user_id = req.body.user_id;
  const recieveStatus = req.body.recieveStatus;
  const buss_id = req.body.buss_id;
  const fundId = req.body.useFundId;
  const currentDate = new Date();
  const notif_type = "buss_update";
  const notif_status = "unread";
  const notif_content = `The product ${product} with the amount of ${amount} has been sent to your paypal account`;
  const notif_business_update =
    "insert into notif_business_update (notif_business_update_id, notif_content, notif_business_table_id) values (?,?,?)";
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const inserIntoNotif =
    "insert into notification ( notif_type, notif_created_at, user_id_reciever, notif_status) values(?,?,?,?)";
  try {
    const response = await axios.get(
      `https://api-m.sandbox.paypal.com/v1/payments/payouts/${payoutBacthId}?page=1&page_size=5&total_required=true`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${accessToken}`,
        },
      }
    );

    if (response) {
      db.query(
        "insert into businessfunds(bussFunds_id,bussFunds_product,bussFunds_amount,bussFunds_amount_recieve_status, bussFunds_paypal_batch_id,bussFunds_created_at,bussFunds_buss_id) values(?,?,?,?,?,?,?)",
        [
          fundId,
          product,
          amount,
          "pending",
          payoutBacthId,
          formattedDate,
          buss_id,
        ],
        (error, result) => {
          if (error) {
            return res.send({ status: false, message: error.message });
          } else {
            db.query(
              inserIntoNotif,
              [notif_type, formattedDate, user_id, notif_status],
              (error, notifResult) => {
                if (error) {
                  console.log(error.message);
                  return res.send({
                    status: false,
                    message: "Error notif",
                  });
                } else {
                  const notif_id = notifResult.insertId;

                  console.log(notif_id);
                  db.query(
                    notif_business_update,
                    [notif_id, notif_content, buss_id],
                    (error, result) => {
                      if (error) {
                        console.log(error.message);
                        return res.send({
                          status: false,
                          message: "Error notif update",
                        });
                      } else {
                        return res.send({
                          status: true,
                          message: "Amount Send",
                        });
                      }
                    }
                  );
                }
              }
            );
          }
        }
      );
    } else {
      return res.send({ status: false, message: "Error" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred" });
  }
});

app.post("/updatesUseFunds", (req, res) => {
  const { id } = req.body;
  const status = "recieve";

  console.log(id, status);
  db.query(
    "update businessfunds set bussFunds_amount_recieve_status = ? where bussFunds_id = ?",
    [status, id],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, message: "Updated Successfully" });
      }
    }
  );
});

app.get("/getWithdrawalUser", (req, res) => {
  const type = req.body.type;

  db.query(
    "select wlt_trans_type, withdrawtrans.*, usertbl.user_fname, usertbl.user_lname from usertbl inner join wallet on usertbl.user_id = wallet.wlt_user_id inner join transactions on wallet.wlt_trans_id = transactions.trans_id inner join withdrawtrans on transactions.trans_id = withdrawtrans.withTrans_trans_id",

    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.get("/admin/listoftransactions", (req, res) => {
  db.query(
    "select * from transactions inner join usertbl on transactions.transac_user_id = usertbl.user_id order by transac_id desc",
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.get("/admin/listofuser", (req, res) => {
  const user_tpye = "admin";
  db.query(
    "select * from usertbl left join user_identity on usertbl.user_id = user_identity.user_identity_user_id where user_type != ?",
    user_tpye,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/admin/displayuserInvestment", (req, res) => {
  const { invst_id, user_id } = req.body;

  const investmentSql =
    "select investment.*, usertbl.*, business.buss_photo, business.buss_name from usertbl inner join investment on usertbl.user_id = investment.invst_user_id inner join businessapproved on investment.invst_buss_approved_buss_id = businessapproved.buss_approved_buss_id inner join business on businessapproved.buss_approved_buss_id = business.buss_id where invst_id = ? and invst_user_id = ?";

  db.query(investmentSql, [invst_id, user_id], (error, result) => {
    if (error) {
      return res.send({ status: false, message: error.message });
    } else {
      return res.send({ status: true, result });
    }
  });
});

app.post("/admin/approvedInvestment", (req, res) => {
  const {
    invst_id,
    invst_update_type,
    invst_status,
    user_id,
    notif_type,
    notif_status,
    notif_content,
  } = req.body;
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const investmentApproval =
    "update investment set invst_status = ? where invst_id = ?";
  const insertIntoInvestmentUpdata =
    "insert into investment_update (invst_update_type,invst_updated_crearted_at,	invst_update_invst_id ) values(?,?,?)";

  const insertIntoNotification =
    "insert into notification ( notif_type, notif_created_at, user_id_reciever, notif_status) values(?,?,?,?)";

  const insertIntoNotifInvestment =
    "insert into notif_investment (notif_investment_id, notif_content, notif_investment_table_id) values(?,?,?)";

  db.query(investmentApproval, [invst_status, invst_id], (error, result) => {
    if (error) {
      return res.send({ status: false, message: error.message });
    } else {
      db.query(
        insertIntoInvestmentUpdata,
        [invst_update_type, formattedDate, invst_id],
        (error) => {
          if (error) {
            return res.send({ status: false, message: error.message });
          } else {
            db.query(
              insertIntoNotification,
              [notif_type, formattedDate, user_id, notif_status],
              (error, resultNotif) => {
                if (error) {
                  return res.send({ status: false, message: error.message });
                } else {
                  const notif_id = resultNotif.insertId;

                  db.query(
                    insertIntoNotifInvestment,
                    [notif_id, notif_content, invst_id],
                    (error, result) => {
                      if (error) {
                        return res.send({
                          status: false,
                          message: error.message,
                        });
                      } else {
                        return res.send({
                          status: true,
                          message: "Investment has approved successfully",
                        });
                      }
                    }
                  );
                }
              }
            );
          }
        }
      );
    }
  });
});

app.get("/admin/listofBusinessApproval", (req, res) => {
  const status = "pending";
  const userType = "entrepreneur";
  db.query(
    "select * from usertbl inner join business on usertbl.user_id = business.buss_user_id where buss_status = ? and usertbl.user_type = ?",
    [status, userType],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/admin/approveBusiness", (req, res) => {
  const businessId = req.body.businessId;

  db.query(
    "select * from business inner join usertbl on business.buss_user_id = usertbl.user_id where business.buss_id = ?",
    businessId,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        db.query(
          "select * from returnloan where returnLoan_buss_id = ?",
          businessId,
          (error, returnLoanData) => {
            if (error) {
              return res.send({ status: false, message: error.message });
            } else {
              return res.send({ status: true, result, returnLoanData });
            }
          }
        );
      }
    }
  );
});

app.get("/admin/userApproval", (req, res) => {
  const status = "No Verified";
  db.query(
    "select * from usertbl where user_status = ?",
    status,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});
app.post("/admin/approveUser", (req, res) => {
  const id = req.body.user_id;
  db.query(
    "select * from usertbl left join user_identity on usertbl.user_id = user_identity.user_identity_user_id where usertbl.user_id = ?",
    id,
    (error, result) => {
      if (error) {
        return res.send({
          status: false,
          message: "Error on fecthing the data",
        });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/admin/userapprove", (req, res) => {
  const user_id = req.body.user_id;
  const verify = "Verified";
  db.query(
    "update usertbl set user_status = ? where user_id = ?",
    [verify, user_id],
    (error, result) => {
      if (error) {
        return res.send({
          status: false,
          message: "Error In Verifying the use",
        });
      } else {
        return res.send({ status: true, message: "User Sucessfully Verified" });
      }
    }
  );
});

app.post("/admin/approveuserbusiness", (req, res) => {
  const buss_id = req.body.buss_id;
  const user_id = req.body.user_id;
  const year = req.body.year;
  const percent = req.body.percent;
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const verify = "approved";
  const notif_content = "You business has been approved";
  const notif_type = "buss_update";
  const notif_status = "unread";
  const notif_business_update =
    "insert into notif_business_update (notif_business_update_id, notif_content, notif_business_table_id) values (?,?,?)";
  const inserIntoNotif =
    "insert into notification (notif_type,notif_created_at,user_id_reciever,notif_status ) values(?,?,?,?)";
  db.query(
    "update business set buss_status = ? where buss_id = ?",
    [verify, buss_id],
    (error, result) => {
      if (error) {
        return res.send({
          status: false,
          message: "Error In approving the business",
        });
      } else {
        db.query(
          "insert into businessapproved (buss_approved_buss_id, buss_approved_updated_month, buss_approved_percent, buss_approved_created_at) values (?,?,?,?)",
          [buss_id, year, percent, formattedDate],
          (error, result) => {
            if (error) {
              console.log(error);
              return res.send({
                status: false,
                message: error.message,
              });
            } else {
              db.query(
                inserIntoNotif,
                [notif_type, formattedDate, user_id, notif_status],
                (error, notifResult) => {
                  if (error) {
                    console.log(error.message);
                    return res.send({
                      status: false,
                      message: "Error notif",
                    });
                  } else {
                    const notif_id = notifResult.insertId;

                    console.log(notif_id);
                    db.query(
                      notif_business_update,
                      [notif_id, notif_content, buss_id],
                      (error, result) => {
                        if (error) {
                          console.log(error.message);
                          return res.send({
                            status: false,
                            message: "Error notif update",
                          });
                        } else {
                          return res.send({
                            status: true,
                            message: "Business Sucessfully Approved",
                          });
                        }
                      }
                    );
                  }
                }
              );
            }
          }
        );
      }
    }
  );
});
app.post("/admin/sendCapital", (req, res) => {
  const amt = req.body.amt;
  const adminEmail = req.body.adminEmail;
  const wallet_user_id = req.body.wallet_user_id;
  const typeWallet = req.body.typeWallet;
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  // db.query(
  //   "insert into transactions (trans_amt,  trans_email, trans_created_at) values(?,?,?)",
  //   [amt, adminEmail, formattedDate],
  //   (error, result) => {
  //     if (error) {
  //       return res.send({ status: false, message: error.message });
  //     } else {
  //       const trans_id = result.insertId;

  //       db.query(
  //         "insert into fundinglog(fndlog_type, fndlog_amt, fndlog_trans_id, fndlog_created_at) values(?,?,?,?)",
  //         [typeWallet, amt, trans_id, formattedDate],
  //         (error, result) => {
  //           if (error) {
  //             return res.send({ status: false, message: error.message });
  //           } else {
  //             db.query(
  //               "insert into wallet (wlt_user_id, wlt_amt, wlt_trans_type, wlt_trans_id) values(?,?,?,?)",
  //               [wallet_user_id, amt, typeWallet, trans_id],
  //               (error, result) => {
  //                 if (error) {
  //                   return res.send({ status: false, message: error.message });
  //                 } else {
  //                   return res.send({
  //                     status: true,
  //                     message: "Capital is send Successfully",
  //                   });
  //                 }
  //               }
  //             );
  //           }
  //         }
  //       );
  //     }
  //   }
  // );
});

app.get("/admin/listofInvestment", (req, res) => {
  db.query(
    "select * from investment inner join usertbl on investment.invst_user_id = usertbl.user_id  order by invst_id desc",
    (error, result) => {
      if (error) {
        return res.send({ status: false, error: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.get(
  "/admin/listofbusiness",
  (req, res) => {
    const userType = "entrepreneur";
    db.query(
      "select business.*, usertbl.* ,businessapproved.*, investor.user_id as investor_id ,investor.user_profile as investor_profile, investor.user_fname as investor_fname, investor.user_lname as investor_lname ,investment.* from business left join usertbl on usertbl.user_id =  business.buss_user_id left join businessapproved on business.buss_id = businessapproved.buss_approved_buss_id left join investment on businessapproved.buss_approved_buss_id = investment.invst_buss_approved_buss_id left join usertbl as investor on investment.invst_user_id = investor.user_id  where usertbl.user_type = ? order by buss_id desc",
      [userType],
      (error, result) => {
        if (error) {
          return res.send({ status: false, error: error });
        } else {
          const businessWithInvestment = [];

          const resultsSet = result;

          resultsSet.forEach((row) => {
            let business = businessWithInvestment.find(
              (item) => item.buss_id === row.buss_id
            );

            if (!business) {
              business = {
                buss_id: row.buss_id,
                buss_name: row.buss_name,
                buss_type: row.buss_type,
                buss_type_name: row.buss_type_name,
                buss_address: row.buss_address,
                buss_photo: row.buss_photo,
                buss_station: row.buss_station,
                buss_station_name: row.buss_station_name,
                buss_experience: row.buss_experience,
                buss_prev_name: row.buss_prev_name,
                buss_summary: row.buss_summary,
                buss_target_audience: row.buss_target_audience,
                buss_useof_funds: row.buss_useof_funds,
                buss_capital: row.buss_capital,
                buss_approved_updated_month: row.buss_approved_updated_month,
                buss_approved_percent: row.buss_approved_percent,
                buss_status: row.buss_status,
                buss_loan_return: row.buss_loan_return,
                buss_user_id: row.buss_user_id,
                buss_installment: row.buss_installment,
                investments: [],
              };
              businessWithInvestment.push(business);
            }

            business.investments.push({
              investor_id: row.investor_id,
              investor_profile: row.investor_profile,
              investor_fname: row.investor_fname,
              investor_lname: row.investor_lname,
              invest_amount: row.invst_amt,
              invst_status: row.invst_status,
              invst_id: row.invst_id,
            });
          });

          return res.send({
            status: true,
            result: businessWithInvestment,
          });
        }
      }
    );
    // db.query(
    //   "select * from business inner join usertbl on business.buss_user_id = usertbl.user_id",
    //   [userType],
    //   (error, result) => {
    //     if (error) {
    //       return res.send({
    //         status: false,
    //         message: "Error on fecthing the data",
    //       });
    //     } else {
    //       return res.send({ status: true, result: result });
    //     }
    //   }
    // );
  },
  []
);

app.get("/admin/getCountFundLogPaypal", (req, res) => {
  db.query(
    "select count(withTrans_id) as numofTransWithdraw from withdrawtrans",
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: "No data" });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/admin/Insertfundlogingpaypal", (req, res) => {
  const data = req.body.data;
  const type = "Withdraw";
});

//For Creating Account for the user
//FOr signup
app.post("/createaccount", (req, res) => {
  const password = req.body.password;
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const usertype = req.body.usertype;
  const firstname = req.body.firstname;
  const lastname = req.body.lastname;
  const middlename = req.body.middlename;
  const Birthday = req.body.Birthday;
  const gender = req.body.gender;
  const phonenum = req.body.phonenum;
  const email = req.body.email;
  const hash = bcrypt.hashSync(password, salt);
  const province = req.body.province;
  const city = req.body.city;
  const barangay = req.body.barangay;
  const age = req.body.age;

  db.query(
    "insert into usertbl (user_type, user_fname, user_lname, user_mname, user_bdate, user_gender, user_age ,user_contact_num, user_email, user_password, user_province, user_city, user_barangay, user_created_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      usertype,
      firstname,
      lastname,
      middlename,
      Birthday,
      gender,
      age,
      phonenum,
      email,
      hash,
      province,
      city,
      barangay,
      formattedDate,
    ],
    (error, result) => {
      if (error) {
        res.send({
          status: false,
          message: error.message,
        });
      } else {
        res.send({ status: true, message: "Account created Succefully" });
      }
    }
  );
});

//FOr login
app.post("/login", (req, res) => {
  const email = req.body.email;
  const pass = req.body.password;

  db.query(
    "select * from usertbl where user_email = ?",
    email,
    (error, result) => {
      if (error) {
        return res.send({ sucess: false, message: error.message });
      }

      if (result.length > 0) {
        bcrypt.compare(pass, result[0].user_password, (err, response) => {
          if (response) {
            return res.send({ success: true, result });
          } else {
            return res.send({ success: false, message: "Wrong password" });
          }
        });
      } else {
        return res.send({ success: false, message: "Wrong username" });
      }
    }
  );
});

app.post("/checkUserStatus", (req, res) => {
  const user_id = req.body.user_id;
  const status = "Verified";
  db.query(
    "select * from usertbl where user_id = ? and user_status =?",
    [user_id, status],
    (error, result) => {
      if (error) {
        return res.send({ success: false, message: "Error on user " });
      } else {
        console.log(result.length);
        if (result.length <= 0) {
          return res.send({
            success: false,
            message: "User is not verify... Please Verify your account first ",
          });
        } else {
          return res.send({ success: true });
        }
      }
    }
  );
});

app.post("/startBusiness", (req, res) => {
  const { installments, buss_id, todayDate } = req.body;
  const statusBusiness = "start";

  const updateBusinessInstallments =
    "update business set buss_installment = ?, buss_status = ? where buss_id = ?";

  const updateInvestmentStartDate =
    "update investment set invst_start_date = ? where invst_buss_approved_buss_id = ?";

  db.query(
    updateBusinessInstallments,
    [installments, statusBusiness, buss_id],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        db.query(
          updateInvestmentStartDate,
          [todayDate, buss_id],
          (error, result) => {
            if (error) {
              return res.send({ status: false, message: error.message });
            } else {
              return res.send({
                status: true,
                message: "Business is successfully started",
              });
            }
          }
        );
      }
    }
  );
});

//Pitch business of entrepreneu
app.post("/pitchbussines", (req, res) => {
  const {
    bussinessName,
    bussinesType,
    bussinessCapital,
    bussinessPhotoURL,
    bussinessDetails,
    permits,
    SupportingDocUrl,
    user_id,
    bussiness,
    bussLocationValue,
    bussBuildingPlaceName,
    bussExperinceValue,
    prevBusinessName,
    targetAudience,
    useFunds,
    installments,
    totalReturn,
    address,
    proofresidence,
  } = req.body;
  const numOfMonths = 12;
  const interest = 5;

  const businesStatus = "pending";
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const mysql =
    "insert into business (buss_name, buss_type, buss_type_name, buss_address, buss_photo, buss_station, buss_station_name, buss_experience, buss_prev_name, buss_summary, buss_target_audience, buss_useof_funds, buss_support_doc, buss_capital, buss_credentials,buss_proof_of_residence ,buss_no_of_months, buss_interest, buss_loan_return, buss_installment, buss_status, buss_created_at, buss_user_id) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";

  db.query(
    mysql,
    [
      bussinessName,
      bussinesType,
      bussiness,
      address,
      bussinessPhotoURL,
      bussLocationValue,
      bussBuildingPlaceName,
      bussExperinceValue,
      prevBusinessName,
      bussinessDetails,
      targetAudience,
      useFunds,
      JSON.stringify(SupportingDocUrl),
      bussinessCapital,
      JSON.stringify(permits),
      JSON.stringify(proofresidence),
      numOfMonths,
      interest,
      totalReturn,
      JSON.stringify(installments),
      businesStatus,
      formattedDate,
      user_id,
    ],
    (error, result) => {
      if (error) {
        console.log(error.message);
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true });
      }
    }
  );
});

app.post("/getTotalInvestAmount", (req, res) => {
  const { buss_id } = req.body;

  db.query(
    "select sum(invst_amt) as totalInvstAmt from investment left join businessapproved on investment.invst_buss_approved_buss_id = businessapproved.buss_approved_buss_id where buss_approved_buss_id = ? order by buss_approved_buss_id",
    buss_id,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

//Wala ni siyay labut
// app.post("/api/userInfo", (req, res) => {
//   const user_id = req.body.user_id;
//   db.query(
//     "select count(buss_id) as countofBusiness, user_profile_photo, usertbl.user_fname, usertbl.user_lname from business left join usertbl on business.buss_user_id = usertbl.user_id where buss_user_id = ? ",
//     user_id,
//     (error, result) => {
//       if (error) {
//         return res.send({ status: false, message: error });
//       } else {
//         return res.send({ status: true, result });
//       }
//     }
//   );
// });

// app.post("/api/businessPhoto", (req, res) => {
//   const user_id = req.body.user_id;
//   db.query(
//     "select buss_photo from business where buss_user_id =? ",
//     user_id,
//     (error, result) => {
//       if (error) {
//         return res.send({ status: false, message: error });
//       } else {
//         return res.send({ status: true, result });
//       }
//     }
//   );
// });

//This is to request all the business of the entrepreneur
app.post("/business", (req, res) => {
  const user_id = req.body.user_id;

  db.query(
    "select * from business left join businessfunds on business.buss_id = businessfunds.bussFunds_buss_id where buss_user_id = ? order by buss_id desc",
    user_id,
    (error, result) => {
      if (error) {
        return res.send(error);
      } else {
        const list = [];
        result.forEach((row) => {
          let business = list.find((item) => item.buss_id === row.buss_id);

          if (!business) {
            business = {
              buss_id: row.buss_id,
              buss_name: row.buss_name,
              buss_type: row.buss_type,
              buss_type_name: row.buss_type_name,
              buss_address: row.buss_address,
              buss_photo: row.buss_photo,
              buss_station: row.buss_station,
              buss_station_name: row.buss_station_name,
              buss_experience: row.buss_experience,
              buss_prev_name: row.buss_prev_name,
              buss_summary: row.buss_summary,
              buss_target_audience: row.buss_target_audience,
              buss_useof_funds: row.buss_useof_funds,
              buss_capital: row.buss_capital,
              buss_approved_updated_month: row.buss_approved_updated_month,
              buss_approved_percent: row.buss_approved_percent,
              buss_installment: row.buss_installment,
              buss_capital: row.buss_capital,
              buss_no_of_months: row.buss_no_of_months,
              buss_interest: row.buss_interest,
              buss_loan_return: row.buss_loan_return,
              buss_status: row.buss_status,
              businessFunds: [],
            };
            list.push(business);
          }

          business.businessFunds.push({
            bussFunds_id: row.bussFunds_id,
            bussFunds_product: row.bussFunds_product,
            bussFunds_amount: row.bussFunds_amount,
            bussFunds_reciept: row.bussFunds_reciept,
            bussFunds_paypal_batch_id: row.bussFunds_paypal_batch_id,
            bussFunds_amount_recieve_status:
              row.bussFunds_amount_recieve_status,
            bussFunds_reciept_status: row.bussFunds_reciept_status,
          });
        });

        return res.send(list);
      }
    }
  );
});

//This is to display all the business pitched by all the entrepreneur
//THis for for the investor feeds
app.post("/list", (req, res) => {
  const userType = "entrepreneur";
  const status = "approved";
  const user_id = req.body.user_id;

  //To check if business is new or not
  const isItemNew = (created_at) => {
    const currentDate = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const createdDate = new Date(created_at);

    return createdDate >= oneMonthAgo && createdDate <= currentDate;
  };

  //To calulcate to invest
  const calculateTotalInvest = (investment) => {
    const investDetails = investment.map((item) => item.invest_amount);

    let totalSum = 0;

    for (let i = 0; i < investDetails.length; i++) {
      totalSum += parseFloat(investDetails[i]);
    }
    if (totalSum) {
      return totalSum;
    } else {
      return 0;
    }
  };
  //Functuon for recomeneded
  const removeDuplicateBussID = (array) => {
    const seenIds = {};
    const duplicates = [];
    const uniqueItems = [];
    for (const item of array) {
      const id = item.buss_id;

      if (seenIds[id]) {
        duplicates.push(id);
      } else {
        seenIds[id] = true;
        uniqueItems.push(item);
      }
    }

    return uniqueItems;
  };
  db.query(
    "select * from user_business_likes where userbusslikes_user_id = ? ",
    user_id,
    (error, resultsLike) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        db.query(
          "select business.*, usertbl.* ,businessapproved.*, investor.user_id as investor_id ,investor.user_profile as investor_profile, investor.user_fname as investor_fname, investor.user_lname as investor_lname ,investment.* from business left join usertbl on usertbl.user_id =  business.buss_user_id left join businessapproved on business.buss_id = businessapproved.buss_approved_buss_id left join investment on businessapproved.buss_approved_buss_id = investment.invst_buss_approved_buss_id left join usertbl as investor on investment.invst_user_id = investor.user_id  where buss_status = ? and usertbl.user_type = ? order by buss_id desc",
          [status, userType],
          (error, result) => {
            if (error) {
              return res.send({ success: false, error: error });
            } else {
              const businessWithInvestment = [];

              const resultsSet = result;

              resultsSet.forEach((row) => {
                let business = businessWithInvestment.find(
                  (item) => item.buss_id === row.buss_id
                );

                if (!business) {
                  business = {
                    buss_id: row.buss_id,
                    buss_name: row.buss_name,
                    buss_type: row.buss_type,
                    buss_type_name: row.buss_type_name,
                    buss_address: row.buss_address,
                    buss_photo: row.buss_photo,
                    buss_station: row.buss_station,
                    buss_station_name: row.buss_station_name,
                    buss_experience: row.buss_experience,
                    buss_prev_name: row.buss_prev_name,
                    buss_summary: row.buss_summary,
                    buss_target_audience: row.buss_target_audience,
                    buss_useof_funds: row.buss_useof_funds,
                    buss_capital: row.buss_capital,
                    buss_created_at: row.buss_created_at,
                    isNew: isItemNew(new Date(row.buss_approved_created_at)),
                    buss_approved_updated_month:
                      row.buss_approved_updated_month,
                    buss_approved_percent: row.buss_approved_percent,
                    investments: [],
                  };
                  businessWithInvestment.push(business);
                } else {
                  business.isNew = isItemNew(
                    new Date(row.buss_approved_created_at)
                  );
                }

                business.investments.push({
                  investor_id: row.investor_id,
                  investor_profile: row.investor_profile,
                  investor_fname: row.investor_fname,
                  investor_lname: row.investor_lname,
                  invest_amount: row.invst_amt,
                });
              });

              //To get the data if business that investments amount are not equal to the capital
              const data = businessWithInvestment.filter((item) => {
                if (
                  item.buss_capital !== calculateTotalInvest(item.investments)
                ) {
                  return item;
                }
              });
              //Business that has an investors
              const withInvestors = data.filter((item) => {
                const investments = item.investments;

                if (
                  Array.isArray(investments) &&
                  investments.some((data) => data.investor_id)
                ) {
                  return true;
                }

                return false;
              });

              //For investor likes business
              const likedTypesString = resultsLike[0].userbusslikes_data;
              const likedTypes = JSON.parse(likedTypesString);

              const filteredBusinessArray = data.filter((business) => {
                const businessTypes = JSON.parse(business.buss_type_name);

                return likedTypes.some((likedType) =>
                  businessTypes.includes(likedType.name)
                );
              });

              //Result of this is for the recommended
              //It works by joining withInvestors and the filteredBusiessArray and return a data which are not duplicated
              const recomended = removeDuplicateBussID([
                ...withInvestors,
                ...filteredBusinessArray,
              ]);

              if (resultsLike.length > 0) {
                return res.send({
                  success: true,
                  result: businessWithInvestment,
                  filterData: data,
                  likesofInvestors: resultsLike,
                  hasLikes: true,

                  withInvestors,
                  recomended,
                });
              } else {
                return res.send({
                  success: true,
                  result: businessWithInvestment,
                  filterData: data,
                  // likesofInvestors: resultsLike,
                  hasLikes: false,

                  withInvestors,
                  recomended,
                });
              }
            }
          }
        );
      }
    }
  );
});

app.post("/savelikes", (req, res) => {
  const { filterLikes, user_id } = req.body;
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  db.query(
    "insert into user_business_likes (userbusslikes_data,userbusslikes_created_at,userbusslikes_user_id) values(?,?,?)",
    [filterLikes, formattedDate, user_id],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, message: "Successfully save" });
      }
    }
  );
});

//!Tiwason ang check sa invesment
app.post("/api/viewentrepbusiness", (req, res) => {
  const buss_id = req.body.buss_id;
  const invesmentBuss_id = "select invst_buss_approved_buss_id from investment";
  const mysql =
    "select business.*, entrprenuer.user_fname, entrprenuer.user_lname  ,businessapproved.*, investor.user_id as investor_id ,investor.user_profile as investor_profile, investor.user_fname as investor_fname, investor.user_lname as investor_lname, investment.* from  business left join usertbl as entrprenuer on business.buss_user_id = entrprenuer.user_id left join businessapproved on business.buss_id = businessapproved.buss_approved_buss_id left join investment on businessapproved.buss_approved_buss_id = investment.invst_buss_approved_buss_id left join usertbl as investor on investment.invst_user_id = investor.user_id where buss_id = ?";

  db.query(mysql, buss_id, (error, result) => {
    if (error) {
      return res.send({ status: false, message: error.message });
    } else {
      const businessWithInvestment = [];

      const resultsSet = result;

      resultsSet.forEach((row) => {
        let business = businessWithInvestment.find(
          (item) => item.buss_id === row.buss_id
        );

        if (!business) {
          business = {
            buss_id: row.buss_id,
            buss_user_id: row.buss_user_id,
            buss_name: row.buss_name,
            buss_type: row.buss_type,
            buss_type_name: row.buss_type_name,
            buss_address: row.buss_address,
            buss_photo: row.buss_photo,
            buss_station: row.buss_station,
            buss_station_name: row.buss_station_name,
            buss_experience: row.buss_experience,
            buss_prev_name: row.buss_prev_name,
            buss_summary: row.buss_summary,
            buss_target_audience: row.buss_target_audience,
            buss_useof_funds: row.buss_useof_funds,
            buss_capital: row.buss_capital,
            buss_approved_updated_month: row.buss_approved_updated_month,
            buss_approved_percent: row.buss_approved_percent,
            investments: [],
          };
          businessWithInvestment.push(business);
        }

        business.investments.push({
          investor_id: row.investor_id,
          investor_profile: row.investor_profile,
          investor_fname: row.investor_fname,
          investor_lname: row.investor_lname,
          invest_amount: row.invst_amt,
        });
      });
      return res.send({ status: true, result: businessWithInvestment });
    }
  });
});

//Unsure asa ni siya
app.post("/api/business", (req, res) => {
  const userType = "entrepreneur";
  const bussId = req.body.businessId;
  db.query(
    "SELECT *, (SELECT COUNT(invst_id) FROM investment WHERE investment.invst_buss_id = business.buss_id) AS invstor_count FROM usertbl right JOIN business ON usertbl.user_id = business.buss_user_id LEFT JOIN investment ON business.buss_id = investment.invst_buss_id LEFT JOIN transactions ON investment.invst_trans_id = transactions.trans_id where user_type = ? && buss_id = ?",
    [userType, bussId],
    (error, result) => {
      if (error) {
        return res.send({ success: false, error: error });
      } else {
        return res.send({ success: true, result });
      }
    }
  );
});

//For deposite
app.post("/invest", (req, res) => {
  const {
    type,
    amount,
    email,

    paypalLog,
    user_id,
    returnSum,
    status,
    month,
    interest,
    buss_id,
    notif_status,
    totalInterest,
  } = req.body;
  const currentDate = new Date();
  const date = currentDate.toISOString().slice(0, 19).replace("T", " ");
  const transactionsSql =
    "insert into transactions (transac_type, transac_amt, transac_email, transac_created_at,transac_paypal_datalog, transac_user_id) values(?,?,?,?,?,?)";

  const investmentSql =
    "insert into investment (invst_amt, invst_returned_amt, invst_interest_sum ,invst_status, invst_num_month, invst_interest, invst_created_at, invst_user_id, invst_transac_id, invst_buss_approved_buss_id ) values(?,?,?,?,?,?,?,?,?,?)";

  const notificationSql =
    "insert into notification ( notif_type, notif_created_at, user_id_reciever, notif_status) values(?,?,?,?)";

  const notif_buss_invest =
    "insert into notif_business_invest (notif_business_invest_id, notif_content, notif_business_table_id,notif_business_investment_id) values (?,?,?,?)";

  const getEntrepId = "select buss_user_id from business where buss_id = ?";
  const investorInfo =
    "select user_fname, user_lname from usertbl where user_id = ?";

  if (amount > 0) {
    db.query(
      transactionsSql,
      [type, amount, email, date, paypalLog, user_id],
      (error, transacResult) => {
        if (error) {
          console.log(error.message);
          return res.send({ status: false, message: error.message });
        } else {
          const trans_id = transacResult.insertId;

          db.query(
            investmentSql,
            [
              amount,
              returnSum,
              totalInterest,
              status,
              month,
              interest,
              date,
              user_id,
              trans_id,
              buss_id,
            ],
            (error, investResult) => {
              if (error) {
                console.log(error.message);
                return res.send({ status: false, message: error.message });
              } else {
                const invst_id = investResult.insertId;
                db.query(getEntrepId, buss_id, (error, entrepIdResult) => {
                  const { buss_user_id } = entrepIdResult[0];

                  db.query(
                    investorInfo,
                    user_id,
                    (error, investorInfoResult) => {
                      const { user_lname, user_fname } = investorInfoResult[0];

                      const content = `${user_fname} ${user_lname} has made an investment to your business`;
                      const typeNotif = "buss_invest";

                      db.query(
                        notificationSql,
                        [typeNotif, date, buss_user_id, notif_status],
                        (error, notifResult) => {
                          if (error) {
                            console.log(error.message);
                            return res.send({
                              status: false,
                              message: error.message,
                            });
                          } else {
                            const notif_id = notifResult.insertId;

                            db.query(
                              notif_buss_invest,
                              [notif_id, content, buss_id, invst_id],
                              (error, result) => {
                                if (error) {
                                  console.log(error.message);
                                  return res.send({
                                    status: false,
                                    message: error.message,
                                  });
                                } else {
                                  return res.send({
                                    status: true,
                                    message: "You successfully invest",
                                  });
                                }
                              }
                            );
                          }
                        }
                      );
                    }
                  );
                });
              }
            }
          );
        }
      }
    );
  }
});

//To get the balance
app.post("/balance", (req, res) => {
  const user_id = req.body.user_id;

  db.query(
    "select wlt_amt as amt, wlt_trans_type as type  from wallet where wlt_user_id = ?",
    user_id,

    (error, result) => {
      if (error) {
        return res.send({ success: false, error });
      } else {
        return res.send({ success: true, result, hasBalance: true });
      }
    }
  );
});

app.post("/uplaodreceipt", (req, res) => {
  const { id, url, status } = req.body;

  db.query(
    "update businessfunds set bussFunds_reciept = ?, bussFunds_reciept_status = ? where bussFunds_id = ? ",
    [url, status, id],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({
          status: true,
          message: "Receipt Succesfully Upload",
        });
      }
    }
  );
});

app.post("/payretunrloan", (req, res) => {
  const {
    amount,
    email,

    paypalDatalog,
    user_id,
    installmentId,
    buss_id,
  } = req.body;
  const type = "returnloan";
  const transactionsSql =
    "insert into transactions (transac_type, transac_amt, transac_email, transac_created_at,transac_paypal_datalog, transac_user_id) values(?,?,?,?,?,?)";

  const retunrLoanSql =
    "insert into returnloan (returnLoan_id, returnLoan_amt, returnLoan_created_at, returnLoan_transac_id, returnLoan_buss_id ) values(?,?,?,?,?)";

  db.query(
    transactionsSql,
    [type, amount, email, currentDate, paypalDatalog, user_id],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        const trans_id = result.insertId;

        db.query(
          retunrLoanSql,
          [installmentId, amount, currentDate, trans_id, buss_id],
          (error, result) => {
            if (error) {
              return res.send({ status: false, message: error.message });
            } else {
              return res.send({ status: true, message: "Successfully Paid" });
            }
          }
        );
      }
    }
  );
});

app.post("/updateReceiptStatus", (req, res) => {
  const { id, status } = req.body;

  const updateReceiptStatus =
    "update businessfunds set bussFunds_reciept_status = ? where bussFunds_id = ?";

  if (status === "approved") {
    db.query(updateReceiptStatus, [status, id], (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({
          status: true,
          message: "Receipt has successfully appoved",
        });
      }
    });
  } else if (status === "declined") {
    db.query(updateReceiptStatus, [status, id], (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({
          status: true,
          message: "Receipt has successfully decline",
        });
      }
    });
  }
});

app.post("/viewBusinessInstallments", (req, res) => {
  const buss_id = req.body.buss_id;

  //const currentDate = new Date();
  //const day = new Date(new Date().setDate);
  // const currentDate = new Date();

  // const formattedDate = currentDate
  //   .toISOString()
  //   .slice(0, 19)
  //   .replace("T", " ");
  const getReturnLoanData =
    "select * from returnloan where returnLoan_buss_id = ? ";
  db.query(
    "select buss_installment from business where buss_id = ?",
    buss_id,
    (error, result) => {
      if (error) {
        console.log(error);
        return res.send({ status: false, message: error.message });
      } else {
        db.query(getReturnLoanData, buss_id, (error, retunrLoanResult) => {
          if (error) {
            console.log(error);
            return res.send({ status: false, message: error.message });
          } else {
            const returnData = retunrLoanResult;
            const installmentsData = JSON.parse(result[0].buss_installment);

            //Function for calulating the total Reypayment
            const totalReyPayment = installmentsData.reduce(
              (sum, item) => sum + item.installment,
              0
            );

            //Function for calculating the total paid amount
            const totalPaidAmount = returnData.reduce(
              (sum, item) => sum + item.returnLoan_amt,
              0
            );

            //Computation for the remaining amount
            const remainingPaymentsAmount = totalReyPayment - totalPaidAmount;

            //get the paid id
            const paidId = returnData.map((item) => item.returnLoan_id);

            const missedPaymentsData = installmentsData.filter(
              (installment) => {
                return (
                  currentDate >= new Date(installment.maxdate) &&
                  !paidId.includes(installment.id)
                );
              }
            );

            const remainingPayment = installmentsData.filter((item) => {
              if (!paidId.includes(item.id)) {
                return item;
              }
            });

            const returnDataIDs = returnData.map((item) => ({
              returnLoan_id: item.returnLoan_id,
              returnLoan_amt: item.returnLoan_amt,
            }));

            const missedPaymentId = missedPaymentsData.map((item) => item.id);

            const installmentsDatas = installmentsData.map((item) => {
              if (missedPaymentId.includes(item.id)) {
                return { ...item, status: "missed" };
              } else {
                const matchingReturnData = returnDataIDs.find(
                  (returnItem) => returnItem.returnLoan_id === item.id
                );

                if (matchingReturnData) {
                  return {
                    ...item,
                    status: "paid",
                    amount: matchingReturnData.returnLoan_amt,
                  };
                } else {
                  return { ...item, status: "not paid" };
                }
              }
            });

            const todayPayment = installmentsDatas.find((item) => {
              if (
                currentDate >= new Date(item.mindate) &&
                currentDate <= new Date(item.maxdate)
              ) {
                return item;
              }
            });

            const handleComputeAddedInterest = (mindate, amount) => {
              const timeDifference = currentDate - new Date(mindate);
              const daysDifference = Math.floor(
                timeDifference / (1000 * 60 * 60 * 24)
              );
              const interest = amount * 0.03;
              const interestAdded = interest * parseInt(daysDifference);
              const totalPayment = interestAdded + amount;
              return totalPayment;
            };

            const missedPayments = installmentsDatas
              .filter((item) => item.status === "missed")
              .map((item) => ({
                data: item,
                totalPayment: handleComputeAddedInterest(
                  item.mindate,
                  item.installment
                ),
              }));

            // console.log(missedPayments);

            return res.send({
              status: true,
              totalReyPayment: totalReyPayment,
              totalPaidAmount: totalPaidAmount,
              remainingPaymentsAmount,
              currentDate,
              remainingPayment,
              todayPayment,
              installmentsDatas,
              missedPayments,
              returnData,
            });
          }
        });
      }
    }
  );
});

app.post("/updateNotifstatus", (req, res) => {
  const { notif_id } = req.body;
  const status = "read";
  const sqlUpdateNotif =
    "update notification set notif_status = ? where notif_id = ? ";

  db.query(sqlUpdateNotif, [status, notif_id], (error, result) => {
    if (error) {
      return res.send({ status: false, message: error.message });
    } else {
      return res.send({ status: true, message: "read" });
    }
  });
});

app.post("/getInvestHasInvestments", (req, res) => {
  const buss_id = req.body.buss_id;
  const user_id = req.body.user_id;
  db.query(
    "select * from investment where invst_user_id = ? and invst_buss_approved_buss_id = ?",
    [user_id, buss_id],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        if (result.length > 0) {
          return res.send({ status: true, hasInvesment: true });
        } else {
          return res.send({
            status: true,

            hasInvesment: false,
          });
        }
      }
    }
  );
});

//For transaction
app.post("/transactions", (req, res) => {
  const user_id = req.body.user_id;

  db.query(
    "select * from wallet inner join transactions on wallet.wlt_trans_id = transactions.trans_id where  wlt_user_id= ?",
    user_id,

    (error, result) => {
      if (error) {
        return res.send({ success: false, error });
      } else {
        return res.send({ success: true, result });
      }
    }
  );
});
//For investing
// app.post("/invest", (req, res) => {
//   const selectBusinessId = req.body.selectBusinessId;
//   const amountInvst = req.body.amountInvst;
//   const user_id = req.body.user_id;
//   const interest = req.body.interest;
//   const rtnAmt = req.body.returnAmt;
//   const month = req.body.month;
//   const type = "invest";
//   const invstStat = "Request";
//   const typeOfInvestment = "annuity";

//   const currentDate = new Date();
//   const formattedDate = currentDate
//     .toISOString()
//     .slice(0, 19)
//     .replace("T", " ");
//   const getWalletBalance =
//     "select sum(wlt_amt) as balance from wallet where wlt_user_id = ?";
//   const insertAmountToTrans =
//     "insert into transactions (trans_amt, trans_email, trans_created_at) values(?,?,?)";

//   const getUserEmail = "select user_email from usertbl where user_id = ?";
//   const insertWallet =
//     "insert into wallet (wlt_user_id, wlt_amt, wlt_trans_type, wlt_trans_id) values(?,?,?,?)";

//   db.query(getUserEmail, [user_id], (error, result) => {
//     if (error) {
//       return res.send({ status: false, message: error.message });
//     } else {
//       const email = result[0].user_email;

//       db.query(getWalletBalance, [user_id], (error, result) => {
//         if (error) {
//           return res.send({ status: false, message: error.message });
//         } else {
//           const balance = parseFloat(result[0].balance);

//           if (parseFloat(amountInvst) <= balance) {
//             const returnAmt = amountInvst * -1;
//             db.query(
//               insertAmountToTrans,
//               [returnAmt, email, formattedDate],
//               (error, result) => {
//                 const trans_id = result.insertId;

//                 if (error) {
//                   return res.send({ status: false, message: error.message });
//                 } else {
//                   db.query(
//                     insertWallet,
//                     [user_id, returnAmt, type, trans_id],
//                     (error, result) => {
//                       if (error) {
//                         return res.send({
//                           status: false,
//                           message: error.message,
//                         });
//                       } else {
//                         db.query(
//                           "insert into investment (invst_buss_id, invst_user_id, invst_amt,invst_returnamt, invst_status, invst_num_month, invst_interest, invst_type, invst_created_at) values(?,?,?,?,?,?,?,?,?)",
//                           [
//                             selectBusinessId,
//                             user_id,
//                             amountInvst,
//                             rtnAmt,
//                             invstStat,
//                             month,
//                             interest,
//                             typeOfInvestment,
//                             formattedDate,
//                           ],
//                           (er, rs) => {
//                             if (er) {
//                               console.log(er);
//                               return res.send({
//                                 sucess: false,
//                                 message: "Error on invest investment",
//                               });
//                             } else {
//                               return res.send({
//                                 sucess: false,
//                                 message: "Successfully Invested",
//                               });
//                             }
//                           }
//                         );
//                       }
//                     }
//                   );
//                 }
//               }
//             );
//           } else {
//             return res.send({
//               status: false,
//               message: "Not Enough Balance",
//             });
//           }
//         }
//       });
//     }
//   });
// });

//Enter the amount to investment
// app.post("/investor/investamt", (req, res) => {
//   const user_id = req.body.user_id;
//   const invstId = req.body.invstId;
//   const amount = req.body.amount;
//   const Investoremail = req.body.Investoremail;
//   const EntrpEmail = req.body.EntrpEmail;
//   const type = "invest";
//   const paymentSource = "Bias Wallet";
//   const investAmountSendStatus = "Send";
//   const currentDate = new Date();
//   const formattedDate = currentDate
//     .toISOString()
//     .slice(0, 19)
//     .replace("T", " ");
//   db.query(
//     "select * from wallet where wlt_user_id =? ",
//     user_id,
//     (error, result) => {
//       if (error) {
//         return res.send({ status: false, message: "Error on search wallet" });
//       } else {
//         if (result.length <= 0) {
//           return res.send({
//             status: false,
//             message: "Your wallet has no balance",
//           });
//         } else {
//           if (parseFloat(result[0].wlt_amt) < parseFloat(amount)) {
//             return res.send({
//               status: false,
//               message: "Not enough balance",
//             });
//           } else {
//             db.query(
//               "insert into transactions (trans_amt,trans_email,  trans_created_at) values(?,?,?)",
//               [amount, Investoremail, formattedDate],
//               (error, result) => {
//                 if (error) {
//                   return res.send({
//                     status: false,
//                     message: "Error on inserting in transactions",
//                   });
//                 } else {
//                   const trans_id = result.insertId;
//                   const investAmt = parseFloat(amount) * -1;
//                   console.log(investAmt);
//                   console.log(trans_id);
//                   db.query(
//                     "insert into wallet(wlt_user_id, wlt_amt, wlt_trans_type, wlt_trans_id) values (?,?,?,?)",
//                     [user_id, investAmt, type, trans_id],
//                     (error, result) => {
//                       if (error) {
//                         return res.send({
//                           status: false,
//                           message: "Error on updating the wallet",
//                         });
//                       } else {
//                         db.query(
//                           "update investment set invst_amount_send_status = ? where invst_id = ?",
//                           [investAmountSendStatus, invstId],
//                           (error, result) => {
//                             if (error) {
//                               return res.send({
//                                 status: false,
//                                 message: "Error updating investment",
//                               });
//                             } else {
//                               return res.send({
//                                 status: true,
//                                 message: "Succuffky Invested",
//                               });
//                             }
//                           }
//                         );
//                       }
//                     }
//                   );
//                 }
//               }
//             );
//           }
//         }
//       }
//     }
//   );
// });
// app.post("/api/getInstallment", (req, res) => {
//   const invst_id = req.body.invst_id;

//   db.query(
//     "select instll_data from installment where instll_invst_id = ?",
//     invst_id,
//     (error, result) => {
//       if (error) {
//         return res.send({ status: false, message: "No data found" });
//       } else {
//         return res.send({ status: true, result });
//       }
//     }
//   );
// });

// app.post("/api/updateInstallData", (req, res) => {
//   const invst_id = req.body.invst_id;
//   const instll_data = req.body.instll_data;
//   db.query(
//     "update installment set instll_data = ? where instll_invst_id = ?",
//     [instll_data, invst_id],
//     (error, result) => {
//       if (error) {
//         return res.send({ status: false, message: "Error on update" });
//       } else {
//         return res.send({
//           status: true,
//           message: "Investmet is update and Business is ready to start.",
//         });
//       }
//     }
//   );
// });

app.post("/api/UpdateBusinessStart", (req, res) => {
  const businessId = req.body.businessId;
  const invst_id = req.body.invst_id;
  const buss_status = "start";

  for (let i = 0; i < invst_id.length; i++) {
    db.query("update investment set invst_status = ? where invst_id = ?", [
      buss_status,
      invst_id[i],
    ]);
  }

  db.query(
    "update business set buss_status = ? where buss_id = ? ",
    [buss_status, businessId],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: "Error on update business" });
      } else {
        return res.send({
          status: true,
          message: "Investmet is update and Business is ready to start.",
        });
      }
    }
  );
});
app.post("/api/getAccumulatedAmt", (req, res) => {
  const buss_id = req.body.buss_id;

  db.query(
    "select sum(investment.invst_amt) as totalAmt, buss_capital, buss_id from business inner join investment on business.buss_id = investment.invst_buss_id where buss_id = ?",
    buss_id,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

//Tp view the investment
//This for investor
app.post("/investment", (req, res) => {
  const user_id = req.body.user_id;
  const todayDate = currentDate;
  db.query(
    "select investment.*, business.*, businessapproved.*, usertbl.user_fname, usertbl.user_lname, usertbl.user_mname  from investment inner join businessapproved on businessapproved.buss_approved_buss_id = investment.invst_buss_approved_buss_id inner join business on businessapproved.buss_approved_buss_id = business.buss_id inner join usertbl on business.buss_user_id = usertbl.user_id where invst_user_id = ? order by invst_id desc",
    user_id,
    (err, result) => {
      if (err) {
        res.send({ status: false, message: err.message });
      } else {
        db.query(
          "select * from investment_update",
          (error, resultUpdateInvste) => {
            if (error) {
              res.send({ status: false, message: err.message });
            } else {
              res.send({ status: true, result, todayDate, resultUpdateInvste });
            }
          }
        );

        //Display the total return amount for investors
      }
    }
  );
});

//View the investor that the entrepreneur will pay
app.post("/api/investortopay", (req, res) => {
  const user_id = req.body.user_id;
  const todayDate = new Date();
  db.query(
    "select usertbl.user_fname, usertbl.user_lname, business.*, investment.invst_start_date as startDate, investment.invst_end_date as endDate from business inner join investment on business.buss_id = investment.invst_buss_id  left join usertbl on investment.invst_user_id = usertbl.user_id where buss_user_id = ? order by business.buss_id",
    user_id,
    (error, result) => {
      if (error) {
        console.log(error);
        res.send({ status: false, message: error.message });
      } else {
        res.send({ status: true, result, todayDates: todayDate });
      }
    }
  );
});

//For uplaod a profile picture of the users
app.post("/api/uploadPhoto", (req, res) => {
  const url = req.body.url;
  const user_id = req.body.user_id;
  db.query(
    "update usertbl set user_profile_photo = ? where user_id = ?",
    [url, user_id],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({
          status: false,
          message: "Profile change sucessfully...",
        });
      }
    }
  );
});

//This is to view the investors of the entrepreneur business
app.post("/api/viewBusinessInvestors", (req, res) => {
  const user_id = req.body.user_id;
  const businessId = req.body.businessId;
  db.query(
    "select *, usertbl.user_fname, usertbl.user_lname, usertbl.user_mname from investment left join business on investment.invst_buss_id = business.buss_id left join usertbl on investment.invst_user_id = usertbl.user_id where buss_id = ?",
    [businessId],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/api/approvedInvestment", (req, res) => {
  const invst_id = req.body.invst_id;
  const status = req.body.invst_status;

  db.query(
    "update investment set invst_status = ? where invst_id = ?",
    [status, invst_id],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        db.query(
          "insert into investmentupdatehistory (invst_his_invst_id, invts_his_content) values(?,?)",
          [invst_id, status],
          (error, result) => {
            if (error) {
              return res.send({ status: false, message: error.message });
            } else {
              return res.send({ status: true, message: "Succeffuly Approved" });
            }
          }
        );
      }
    }
  );
});

app.post("/api/view/investment", (req, res) => {
  const invst_id = req.body.invest_id;

  db.query(
    "select * from usertbl inner join investment on usertbl.user_id = investment.invst_user_id where investment.invst_id = ?",
    invst_id,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

//Display the investment that the entrepreneur will be
//WIth starting date to end date.
app.post("/api/request/investmentPayDetails", (req, res) => {
  const invst_id = req.body.invst_id;

  db.query(
    "select invst_start_date as startDate, invst_end_date as endDate, trans_amt as investAmt, invst_interest as interest, invst_num_year as yearofInvestment from investment inner join transactions on investment.invst_trans_id = transactions.trans_id where invst_id = ?",
    invst_id,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        //console.log(result[0].investAmt);
        const NumofMonthinYear = 12;
        const numYear = result[0].yearofInvestment;
        const totalMonthofInvestmentToPay =
          parseInt(numYear) * parseInt(NumofMonthinYear);
        const totalAmount =
          parseInt(result[0].investAmt) + parseInt(result[0].interest);
        const totalAmtMonthly = totalAmount / totalMonthofInvestmentToPay;

        return res.send({
          status: true,
          startDate: result[0].startDate,
          endDate: result[0].endDate,
          totalAmtMonthly: totalAmtMonthly.toFixed(2),
          totalAmount: totalAmount,
        });
      }
    }
  );
});

app.post("/api/returnPayment", (req, res) => {
  const invst_id = req.body.invst_id;
  const amount = req.body.amount;
  const user_id = req.body.user_id;
  const type = "distribution";
  const currency = "PHP";
  const status = "COMPLETED";
  const paymentSource = "Bias Wallet";
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  db.query(
    "select * from wallet where wlt_user_id = ?",
    user_id,
    (e, results) => {
      if (e) {
        return res.send({ status: false, message: "Error on wallet" });
      } else {
        if (results[0].wlt_balance > amount) {
          db.query(
            "update wallet set wlt_balance = wlt_balance - ? where wlt_user_id = ?",
            [amount, user_id],
            (err, result) => {
              if (err) {
                return res.send({
                  status: false,
                  message: err.message,
                });
              } else {
                db.query(
                  "select user_email from usertbl inner join investment on usertbl.user_id = investment.invst_user_id where invst_id = ?",
                  invst_id,
                  (error, rslt) => {
                    if (error) {
                      return res.send({
                        status: false,
                        message: error.message,
                      });
                    } else {
                      const payee = rslt[0].user_email;

                      db.query(
                        "insert into transactions (trans_amt, trans_type,   trans_wlt_user_id, trans_payment_source, trans_created_at) values(?,?,?,?,?,?,?,?)",
                        [amount, type, user_id, formattedDate],
                        (errors, rslts) => {
                          if (errors) {
                            console.log(errors);
                            return res.send({
                              status: false,
                              message: errors.message,
                            });
                          } else {
                            const trans_id = rslts.insertId;
                            db.query(
                              "insert into returnearnings (rtrn_trans_id, rtrn_invst_id, rtrn_amt, rtrn_created_at) values(?,?,?,?)",
                              [trans_id, invst_id, amount, formattedDate],
                              (errs, reslts) => {
                                if (errs) {
                                  return res.send({
                                    status: false,
                                    message: errs.message,
                                  });
                                } else {
                                  return res.send({
                                    status: true,
                                    message: "Amount Return Sucessfully",
                                  });
                                }
                              }
                            );
                          }
                        }
                      );
                    }
                  }
                );
              }
            }
          );
        } else {
          return res.send({
            status: false,
            message: "Insufficient Balance",
          });
        }
      }
    }
  );
});

app.post("/returnsDates", (req, res) => {
  const invest_id = req.body.invst_id;

  db.query(
    "select * from installment where instll_invst_id = ?",
    invest_id,
    (error, result) => {
      if (error) {
        return res.send({
          status: false,
          message: err.message,
        });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/returnHistory", (req, res) => {
  const invest_id = req.body.invst_id;
  const user_id = req.body.user_id;
  db.query(
    "select installmentpayment.* from installmentpayment inner join investment on installmentpayment.installpayment_invst_id = investment.invst_id where invst_id = ?",
    [invest_id],
    (error, result) => {
      if (error) {
        return res.send({
          status: false,
          message: error.message,
        });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/api/returnhistory", (req, res) => {
  const invest_id = req.body.invst_id;

  db.query(
    "select * from returnearnings where rtrn_invst_id = ?",
    invest_id,
    (error, result) => {
      if (error) {
        return res.send({
          status: false,
          message: err.message,
        });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/checkInstallmentPayment", (req, res) => {
  const intll_id = req.body.intll_id;

  db.query(
    "select * from installmentpayment where installpayment_install_id = ?",
    intll_id,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/investmentdetails", (req, res) => {
  const invest_id = req.body.invst_id;

  db.query(
    "select * from investment where invst_id = ?",
    invest_id,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/sendMessage", (req, res) => {
  const message = req.body.message;
  const chat_id = req.body.chat_id;
  const senderId = req.body.senderId;
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  db.query(
    "insert into messages (msg_content, msg_user_sends, msg_chats_id, msg_datetime) values(?,?,?,?)",
    [message, senderId, chat_id, formattedDate],
    (err, results) => {
      if (err) {
        return res.send({
          status: false,
          message: "Error on inserting message 2",
        });
      } else {
        return res.send({
          status: true,
        });
      }
    }
  );
});

app.post("/chatcontact", (req, res) => {
  const userId = req.body.userId;
  const recieverId = req.body.recieverId;
  db.query(
    "SELECT CR.*, U1.user_fname AS user1_name, U2.user_fname AS user2_name, M.msg_content AS last_message, M.msg_datetime AS last_message_timestamp FROM chats AS CR INNER JOIN usertbl AS U1 ON CR.cht_user_id_f = U1.user_id INNER JOIN usertbl AS U2 ON CR.cht_user_id_s = U2.user_id INNER JOIN messages AS M ON CR.cht_id = M.msg_chats_id WHERE (U1.user_id = ? OR U2.user_id = ?) AND M.msg_datetime = (SELECT MAX(msg_datetime) FROM messages AS sub WHERE sub.msg_chats_id = CR.cht_id)",
    [userId, userId],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: "Error" });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/admin/getChatRooms", (req, res) => {
  const { adminId } = req.body;

  db.query(
    "select * from usertbl inner join chatroom on usertbl.user_id = chatroom.cht_user_id where cht_admin_id = ? ",
    adminId,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/admin/chatsmsgs", (req, res) => {
  const { chatroom_id } = req.body;

  db.query(
    "select * from chatmsg where chtmsg_chtroom_id = ?",
    chatroom_id,
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/api/getchtmsg", (req, res) => {
  const { adminId, user_id } = req.body;
  const checkChatRoomSql =
    "select chtroom_id from chatroom where cht_admin_id = ? and cht_user_id = ? ";
  db.query(checkChatRoomSql, [adminId, user_id], (error, results) => {
    if (error) {
      return res.send({ status: false, message: error.message });
    } else {
      if (results.length > 0) {
        const chatroom_id = results[0].chtroom_id;
        db.query(
          "select * from chatmsg where chtmsg_chtroom_id = ?",
          chatroom_id,
          (error, result) => {
            if (error) {
              return res.send({ status: false, message: error.message });
            } else {
              return res.send({ status: true, result });
            }
          }
        );
      }
    }
  });
});

app.post("/api/create-chat-room", (req, res) => {
  const { adminId, user_id, content, senderId } = req.body;
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const insertIntoChatroom =
    "insert into chatroom (cht_admin_id, cht_user_id) values(?,?)";
  const insertIntoChtmsg =
    "insert into chatmsg (chtmsg_content, chtmsg_sender_id,chtmsg_chtroom_id, chtmsg_created_at) values(?,?,?,?)";
  const checkChatRoomSql =
    "select chtroom_id from chatroom where cht_admin_id = ? and cht_user_id = ? ";

  db.query(checkChatRoomSql, [adminId, user_id], (error, result) => {
    if (error) {
      return res.send({ status: false });
    } else {
      if (result.length > 0) {
        const chtRoomID = result[0].chtroom_id;
        console.log(chtRoomID);
        db.query(
          insertIntoChtmsg,
          [content, senderId, chtRoomID, formattedDate],
          (error, result) => {
            if (error) {
              return res.send({ status: false, message: error.message });
            } else {
              return res.send({ status: true });
            }
          }
        );
      } else {
        db.query(insertIntoChatroom, [adminId, user_id], (error, results) => {
          if (error) {
            return res.send({ status: false, message: error.message });
          } else {
            const chatroomID = results.insertId;
            db.query(
              insertIntoChtmsg,
              [content, senderId, chatroomID, formattedDate],
              (error, result) => {
                if (error) {
                  return res.send({ status: false, message: error.message });
                } else {
                  return res.send({ status: true });
                }
              }
            );
          }
        });
      }
    }
  });
});

app.post("/acceptInvetment", (req, res) => {
  const invest_id = req.body.invest_id;
  const accept = req.body.status;
  db.query(
    "update investment set invst_status = ? where invst_id = ? ",
    [accept, invest_id],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({
          status: true,
          message: "Investment Accepted Successfully",
        });
      }
    }
  );
});

app.post("/user/myprofile", (req, res) => {
  const user_id = req.body.user_id;

  db.query(
    "select * from usertbl where user_id =?",
    user_id,
    (error, result) => {
      if (error) {
        return res.send({
          status: false,
          message: "Error on fecthing the data",
        });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/uploadVerify", (req, res) => {
  const front = req.body.front;
  const back = req.body.back;
  const user = req.body.user;
  const user_id = req.body.user_id;
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const idType = req.body.idType;
  db.query(
    "insert into user_identity (user_identity_photo, user_identity_id_type, user_identity_front_id, user_identity_back_id,user_identity_user_id,user_identity_created_at) values(?,?,?,?,?,?)",
    [user, idType, front, back, user_id, formattedDate],
    (error, result) => {
      if (error) {
        return res.send({
          status: false,
          message: "Error on inserting data",
        });
      } else {
        return res.send({ status: true, message: "Succefully Sumbmited" });
      }
    }
  );
});

app.post("/getNotif", (req, res) => {
  const user_id = req.body.user_id;
  const status = "unread";
  const notif_type = req.body.notif_type;
  const type = "buss_update";
  if (notif_type === "business") {
    // db.query(
    //   "select notification.*, business.buss_photo, notif_content from notification inner join notif_business_update on notification.notif_id = notif_business_update.notif_business_update_id inner join business on notif_business_update.notif_business_table_id = business.buss_id where notification.user_id_reciever = ? and notif_status = ? and notif_type = ?",
    //   [user_id, status, type],
    //   (error, buss_update_result) => {
    //     // const arrayData = result.concat(buss_update_result);

    //     return res.send({ status: true, result: buss_update_result });
    //   }
    // );
    db.query(
      "select notification.*, usertbl.user_id as investorID, notif_content,usertbl.user_profile as investorProfile, business.buss_id as businessID from notification inner join notif_business_invest on notification.notif_id = notif_business_invest.notif_business_invest_id inner join business on notif_business_invest.notif_business_table_id = business.buss_id inner join investment on notif_business_invest.notif_business_investment_id =  investment.invst_id inner join usertbl on investment.invst_user_id = usertbl.user_id where  notification.notif_type = 'buss_invest'  and notification.user_id_reciever = ? group by notif_id",
      [user_id],
      (error, result) => {
        if (error) {
          return res.send({ status: false, message: error.message });
        } else {
          db.query(
            "select notification.*, business.buss_photo, notif_content from notification inner join notif_business_update on notification.notif_id = notif_business_update.notif_business_update_id inner join business on notif_business_update.notif_business_table_id = business.buss_id where notification.user_id_reciever = ?  and notif_type = ?",
            [user_id, type],
            (error, buss_update_result) => {
              const arrayData = result.concat(buss_update_result);

              return res.send({ status: true, result: arrayData });
            }
          );
        }
      }
    );
  } else if (notif_type === "investment") {
    db.query(
      "select notification.*, notif_content, buss_photo from notification inner join notif_investment on notification.notif_id = notif_investment.notif_investment_id inner join investment on notif_investment.notif_investment_table_id = investment.invst_id inner join businessapproved on investment.invst_buss_approved_buss_id = businessapproved.buss_approved_buss_id inner join business on businessapproved.buss_approved_buss_id = business.buss_id where notif_type = 'investment'  and user_id_reciever = ?",
      [user_id],
      (error, result) => {
        if (error) {
          return res.send({ status: false, message: error.message });
        } else {
          return res.send({ status: true, result });
        }
      }
    );
  }
});
app.post("/getNotifCount", (req, res) => {
  const user_id = req.body.user_id;
  const status = "unread";
  db.query(
    "select count(notif_id) as notifCount from notification where user_id_reciever = ? and notif_status = ?",
    [user_id, status],
    (error, result) => {
      if (error) {
        return res.send({ status: false, message: error.message });
      } else {
        return res.send({ status: true, result });
      }
    }
  );
});

app.post("/investor/acepptInstallment", (req, res) => {
  const instll_id = req.body.instll_id;
  const status = "Approved";
  db.query(
    "update installment set instll_invst_approval = ? where instll_id = ?",
    [status, instll_id],
    (error, result) => {
      if (error) {
        return res.send({
          status: false,
          message: "Error ",
        });
      } else {
        return res.send({ status: true, message: "Succesffuly inserted" });
      }
    }
  );
});

app.post("/client/insertNotif", (req, res) => {
  const id = req.body.id;
  const type = req.body.type;
  const content = req.body.content;

  const status = "not read";
  const currentDate = new Date();
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  db.query(
    "insert into notifications (notif_user_id, notif_type, notif_content, notif_status, notif_timestamp) values(?,?,?,?,?)",
    [id, type, content, status, formattedDate],
    (error, result) => {
      if (error) {
        return res.send({
          status: false,
          message: error.message,
        });
      } else {
        return res.send({ status: true, message: "Succesffuly inserted" });
      }
    }
  );
});

// app.post("/", (req, res) => {
//   const user_id = req.body.user_id;
//   const amount = req.body.amount;
//   const type = req.body.type;
//   const email = req.body.email;
//   const payee = req.body.payee;
//   const paymentsource = req.body.paymentsource;
//   const currentDate = new Date();
//   const witdrawAmt = parseFloat(amount) * -1;
//   const formattedDate = currentDate
//     .toISOString()
//     .slice(0, 19)
//     .replace("T", " ");
//   db.query(
//     "select * from wallet where wlt_user_id = ?",
//     user_id,
//     (error, result) => {
//       if (error) {
//         return res.send({
//           status: false,
//           message: "NO acount for that wallet ",
//         });
//       } else {
//         db.query(
//           "insert into transactions (trans_amt, trans_email, trans_created_at) values(?,?,?)",
//           [witdrawAmt, email, formattedDate],
//           (error, result) => {
//             if (error) {
//               return res.send({
//                 status: false,
//                 message: "Error on insert in transactions",
//               });
//             } else {
//               const trans_id = result.insertId;

//               db.query(
//                 "insert into wallet (wlt_user_id, wlt_amt, wlt_trans_type, wlt_trans_id) values(?,?,?,?)",
//                 [user_id, witdrawAmt, type, trans_id],
//                 (error, result) => {
//                   if (error) {
//                     return res.send({
//                       status: false,
//                       message: "Error on insert in wallet",
//                     });
//                   } else {
//                     db.query(
//                       "insert into withdrawtrans(withTrans_trans_id, withTrans_PaypalEmail,withTrans_amt,withTrans_created_at) values(?,?,?,?)",
//                       [trans_id, email, amount, formattedDate],
//                       (error, result) => {
//                         if (error) {
//                           return res.send({
//                             status: false,
//                             message: "Error on insert in withdrawtrans",
//                           });
//                         } else {
//                           return res.send({
//                             status: true,
//                             message: "Withdraw request send succeffuly",
//                           });
//                         }
//                       }
//                     );
//                   }
//                 }
//               );
//             }
//           }
//         );
//       }
//     }
//   );
// });

app.post("/returnProfit", (req, res) => {
  const amout = req.body.amout;
  const datePayment = req.body.date;
  const install_id = req.body.install_id;
  const user_id = req.body.user_id;
  const type = "returnProfit";
  const currentDate = new Date();
  const paymentDate = new Date(datePayment)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const formattedDate = currentDate
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const getWalletBalance =
    "select sum(wlt_amt) as balance from wallet where wlt_user_id = ?";
  const insertAmountToTrans =
    "insert into transactions (trans_amt, trans_email, trans_created_at) values(?,?,?)";

  const getUserEmail = "select user_email from usertbl where user_id = ?";
  const insertWallet =
    "insert into wallet (wlt_user_id, wlt_amt, wlt_trans_type, wlt_trans_id) values(?,?,?,?)";
  const insertToInstallPayment =
    "insert into installmentpayment (installpayment_amout, installpayment_install_id, installpayment_date, installpayment_trans_id,installpayment_created_at) values(?,?,?,?,?)";
  db.query(getUserEmail, [user_id], (error, result) => {
    if (error) {
      return res.send({ status: false, message: error.message });
    } else {
      const email = result[0].user_email;

      db.query(getWalletBalance, [user_id], (error, result) => {
        if (error) {
          return res.send({ status: false, message: error.message });
        } else {
          const balance = parseFloat(result[0].balance);

          if (parseFloat(amout) <= balance) {
            const returnAmt = amout * -1;
            db.query(
              insertAmountToTrans,
              [returnAmt, email, formattedDate],
              (error, result) => {
                const trans_id = result.insertId;

                if (error) {
                  return res.send({ status: false, message: error.message });
                } else {
                  db.query(
                    insertWallet,
                    [user_id, returnAmt, type, trans_id],
                    (error, result) => {
                      if (error) {
                        return res.send({
                          status: false,
                          message: error.message,
                        });
                      } else {
                        db.query(
                          insertToInstallPayment,
                          [
                            amout,
                            install_id,
                            paymentDate,
                            trans_id,
                            formattedDate,
                          ],
                          (error, result) => {
                            if (error) {
                              return res.send({
                                status: false,
                                message: error.message,
                              });
                            } else {
                              return res.send({
                                status: true,
                                message: "Return Successfuly",
                              });
                            }
                          }
                        );
                      }
                    }
                  );
                }
              }
            );
          } else {
            return res.send({
              status: false,
              message: "Not Enough Balance",
            });
          }
        }
      });
    }
  });
});
